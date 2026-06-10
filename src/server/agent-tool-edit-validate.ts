import type { EntityData, HandlerData } from "../core/game-data.js";
import type { WorldEditOp, WorldEditTargetKind } from "./storage.js";
import type { ToolContext } from "./agent-tool-context.js";
import type { ConversationSetInput } from "./agent-tool-schemas.js";

/**
 * World-consistency validation for apply_edits batches: existence checks,
 * structural-tag protection, conversation-entry checks. Pure reads — nothing
 * here mutates the world.
 */

export interface NormalizedEdit {
  kind: WorldEditTargetKind;
  id: string;
  op: WorldEditOp;
  payload: unknown;
}

export function validateEditAgainstWorld(
  edit: NormalizedEdit,
  { context, createdInBatch }: { context: ToolContext; createdInBatch: Set<string> },
): string | null {
  if (edit.kind === "conversation") {
    return validateConversationEdit(edit, { context, createdInBatch });
  }
  if (edit.kind === "entity") {
    const exists = context.store.has(edit.id) || createdInBatch.has(edit.id);
    if (edit.op === "create" && exists) {
      return `Entity "${edit.id}" already exists; use entityUpdate to modify or pick a different id.`;
    }
    if ((edit.op === "update" || edit.op === "delete") && !exists) {
      return `Entity "${edit.id}" does not exist.`;
    }
    if (edit.op === "update" && context.store.has(edit.id)) {
      const reason = validateEntityUpdateOverlay(context, edit);
      if (reason) return reason;
    }
    if (edit.op === "create") {
      const data = edit.payload as EntityData;
      if (!context.store.has(data.location) && !createdInBatch.has(data.location)) {
        return `Entity "${edit.id}" create payload references unknown location "${data.location}".`;
      }
    }
    return null;
  }
  // handler
  const existing = handlerExists(context, edit.id);
  if (edit.op === "create" && existing) {
    return `Handler "${edit.id}" already exists; use handlerUpdate to modify or pick a different name.`;
  }
  if ((edit.op === "update" || edit.op === "delete") && !existing) {
    return `Handler "${edit.id}" does not exist.`;
  }
  if (edit.op === "create") {
    const data = edit.payload as HandlerData;
    if (!data.perform) {
      return `Handler "${edit.id}" create payload must include a 'perform' code body.`;
    }
  }
  return null;
}

/**
 * Sanity-check an entityUpdate overlay for two observed foot-guns: an empty
 * properties object (a silent no-op — usually means the provider stripped
 * the model's free-form keys), and a tags array that drops a structural tag
 * (tag overlays REPLACE; losing "exit"/"room" breaks the entity).
 */
function validateEntityUpdateOverlay(context: ToolContext, edit: NormalizedEdit): string | null {
  const overlay = edit.payload as Partial<EntityData>;
  if (
    overlay.properties !== undefined &&
    overlay.properties !== null &&
    Object.keys(overlay.properties).length === 0
  ) {
    return (
      `Entity "${edit.id}" update has an EMPTY properties object — this does nothing. ` +
      'If you wrote specific keys (e.g. {"locked": true}) and they aren\'t arriving, ' +
      "your provider may be stripping free-form object keys from tool arguments; " +
      "try again, and mention each property as its own key. Omit 'properties' entirely " +
      "if you didn't mean to change any."
    );
  }
  if (Array.isArray(overlay.tags)) {
    const existing = context.store.get(edit.id).tags;
    for (const structural of ["exit", "room"]) {
      if (existing.includes(structural) && !overlay.tags.includes(structural)) {
        return (
          `Entity "${edit.id}" update sets tags=[${overlay.tags.join(", ")}], which would ` +
          `remove the structural tag "${structural}" — tag arrays REPLACE the existing ` +
          `value, and stripping "${structural}" breaks the entity (exits stop being ` +
          "traversable, rooms stop being rooms). Include the current tags " +
          `(${existing.join(", ")}) plus your additions, or omit 'tags' entirely.`
        );
      }
    }
  }
  return null;
}

/**
 * Validate a conversationSet edit: the target NPC must exist and be
 * reachable via "talk to" (talkable tag), and any set-property effects must
 * use registered property names — an unregistered name would only blow up
 * later, mid-conversation, where the error is much harder to trace.
 */
function validateConversationEdit(
  edit: NormalizedEdit,
  { context, createdInBatch }: { context: ToolContext; createdInBatch: Set<string> },
): string | null {
  const npcId = edit.id;
  const inStore = context.store.has(npcId);
  if (!inStore && !createdInBatch.has(npcId)) {
    return `conversationSet target "${npcId}" does not exist. The target must be the NPC's entity id.`;
  }
  if (inStore && !context.store.get(npcId).tags.includes("talkable")) {
    return (
      `Entity "${npcId}" is not tagged "talkable" — players can only start conversations ` +
      '("talk to X") with talkable entities, so this dialogue would be unreachable. Add the ' +
      "tag via entityUpdate first (include the existing tags; tag arrays replace)."
    );
  }
  const entry = edit.payload as ConversationSetInput;
  if (!entry.word || entry.word.trim().length === 0) {
    return `conversationSet for "${npcId}" has an empty word.`;
  }
  for (const effect of entry.effects || []) {
    if (effect.type === "set-property") {
      if (!effect.property) {
        return `conversationSet "${entry.word}" has a set-property effect with no property name.`;
      }
      if (!(effect.property in context.store.registry.definitions)) {
        const known = Object.keys(context.store.registry.definitions).toSorted().join(", ");
        return (
          `conversationSet "${entry.word}" effect uses unregistered property ` +
          `"${effect.property}". Valid property names are: ${known}.`
        );
      }
    }
    if (effect.type === "move" && (effect.property !== "location" || !effect.value)) {
      return (
        `conversationSet "${entry.word}" move effect must have property: "location" and ` +
        "value: <destination entity id>."
      );
    }
  }
  return null;
}

function handlerExists(context: ToolContext, name: string): boolean {
  // Check the live verb registry first (covers built-in handlers and any
  // committed AI handlers from previous sessions; accepted session edits are
  // applied to it immediately). Then check this session's pending edits,
  // MOST RECENT FIRST — the latest create/delete for a name wins, so a
  // create→delete→create rewrite cycle validates correctly.
  if (context.verbs.getByName(name)) return true;
  for (let i = context.pendingEdits.length - 1; i >= 0; i--) {
    const edit = context.pendingEdits[i]!;
    if (edit.targetKind !== "handler" || edit.targetId !== name) continue;
    return edit.op !== "delete";
  }
  return false;
}
