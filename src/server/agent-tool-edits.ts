import type { EntityData, HandlerData } from "../core/game-data.js";
import { UndefinedPropertyError } from "../core/entity-errors.js";
import type {
  NewWorldEditRecord,
  WorldEditOp,
  WorldEditRecord,
  WorldEditTargetKind,
} from "./storage.js";
import type { ToolContext } from "./agent-tool-context.js";
import { applyPendingEditsToWorld } from "./agent-world-view.js";
import { validateHandlerCode } from "./handler-code-validate.js";
import type { EditBatchInput, EditInput } from "./agent-tool-schemas.js";

/**
 * Result returned to the agent when an apply_edits batch succeeds.
 */
export interface EditBatchResult {
  ok: true;
  applied: number;
  /** A short per-edit description for the agent's working memory. */
  edits: Array<{ kind: WorldEditTargetKind; id: string; op: WorldEditOp }>;
  /** Warnings about auto-repairs (e.g. over-escaped handler code). */
  notes?: string[];
}

/**
 * Result returned to the agent when an apply_edits batch is rejected.
 * No edits were appended to the log; the agent should fix and retry.
 */
export interface EditBatchError {
  ok: false;
  error: string;
  failures: Array<{ index: number; reason: string }>;
}

interface NormalizedEdit {
  kind: WorldEditTargetKind;
  id: string;
  op: WorldEditOp;
  payload: unknown;
}

/**
 * Validate a batch of edits and, if every entry is valid, append them to
 * the world_edits log AND apply them to the in-memory store/verbs so the
 * agent's next read includes them. Reject the whole batch on any failure.
 */
export async function applyEditBatch(
  context: ToolContext,
  input: EditBatchInput,
): Promise<EditBatchResult | EditBatchError> {
  const normalized: NormalizedEdit[] = [];
  const failures: Array<{ index: number; reason: string }> = [];

  for (let i = 0; i < input.edits.length; i++) {
    const item = input.edits[i]!;
    const result = normalizeEdit(item, i);
    if ("error" in result) {
      failures.push({ index: i, reason: result.error });
    } else {
      normalized.push(result);
    }
  }

  const notes: string[] = [];
  if (failures.length === 0) {
    // Second pass: validate against the world view (existence checks) and
    // syntax-check handler code bodies (repairing over-escaping in place).
    // Entities created earlier in this same batch count as existing, so a
    // batch can create a container and put new items inside it in one call.
    const createdInBatch = new Set<string>();
    for (const [i, edit] of normalized.entries()) {
      const reason = validateEditAgainstWorld(edit, { context, createdInBatch });
      if (edit.kind === "entity" && edit.op === "create") createdInBatch.add(edit.id);
      if (reason) {
        failures.push({ index: i, reason });
        continue;
      }
      if (edit.kind === "handler" && (edit.op === "create" || edit.op === "update")) {
        const payload = edit.payload as Partial<HandlerData>;
        const form = resolveHandlerForm(context, { name: edit.id, payload });
        const check = validateHandlerCode(payload, { name: edit.id, form });
        notes.push(...check.notes);
        if (check.error) failures.push({ index: i, reason: check.error });
      }
    }
  }

  if (failures.length > 0) {
    return {
      ok: false,
      error: `Rejected ${failures.length} of ${input.edits.length} edits; nothing was applied.`,
      failures,
    };
  }

  // Try to apply to the in-memory view FIRST, in a snapshot we can restore
  // if any edit's apply throws (e.g. UndefinedPropertyError from store.create).
  // Only if the apply succeeds end-to-end do we append to the persistent log.
  // This keeps the world_edits log and the in-memory store in lockstep — no
  // half-applied batches leaking into storage where future ticks would replay
  // them.
  const trialEdits: WorldEditRecord[] = normalized.map((edit, i) => ({
    seq: -1 - i, // dummy seq for the trial run
    gameId: context.gameId,
    sessionId: context.sessionId,
    targetKind: edit.kind,
    targetId: edit.id,
    op: edit.op,
    payload: edit.payload,
    priorState: null,
    applied: false,
    createdAt: new Date().toISOString(),
  }));

  const snapshot = context.store.saveState();
  try {
    applyPendingEditsToWorld(trialEdits, {
      store: context.store,
      verbs: context.verbs,
      gameId: context.gameId,
    });
  } catch (e: unknown) {
    context.store.restoreState(snapshot);
    let reason = e instanceof Error ? e.message : String(e);
    // UndefinedPropertyError is the most common surprise — the agent picks
    // a property name that isn't in the registry and gets a one-line error
    // with no hint about valid alternatives. List the registered names so it
    // can pick one without re-reading the system prompt.
    if (e instanceof UndefinedPropertyError) {
      const known = Object.keys(context.store.registry.definitions).toSorted().join(", ");
      reason = `${reason}. Valid property names are: ${known}. Properties cannot be created ad-hoc; pick one of these or rethink the design.`;
    }
    return {
      ok: false,
      error: `Edit batch failed during apply: ${reason}. Nothing was persisted.`,
      failures: [{ index: -1, reason }],
    };
  }

  // Apply succeeded — now append the edits to the persistent log so future
  // ticks (and the eventual commit on finish) see them.
  const appended: WorldEditRecord[] = [];
  for (const edit of normalized) {
    const newRecord: NewWorldEditRecord = {
      gameId: context.gameId,
      sessionId: context.sessionId,
      targetKind: edit.kind,
      targetId: edit.id,
      op: edit.op,
      payload: edit.payload,
      createdAt: new Date().toISOString(),
    };
    const stored = await context.storage.appendWorldEdit(newRecord);
    appended.push(stored);
    context.pendingEdits.push(stored);
  }

  const result: EditBatchResult = {
    ok: true,
    applied: appended.length,
    edits: appended.map((e) => ({
      kind: e.targetKind,
      id: e.targetId,
      op: e.op,
    })),
  };
  if (notes.length > 0) result.notes = notes;
  return result;
}

/**
 * Effective pattern form for a handler edit: the payload's own pattern wins;
 * for updates without a pattern, fall back to the existing handler (the
 * context registry already includes this session's pending edits).
 */
function resolveHandlerForm(
  context: ToolContext,
  { name, payload }: { name: string; payload: Partial<HandlerData> },
): string | undefined {
  if (payload.pattern && payload.pattern.form) return payload.pattern.form;
  const existing = context.verbs.getByName(name);
  return existing ? existing.pattern.form : undefined;
}

/**
 * Detect which of the six op fields the agent set on this flat edit. Returns
 * an error if zero or more than one is set — both are user mistakes worth
 * surfacing immediately rather than guessing.
 */
function normalizeEdit(item: EditInput, index: number): NormalizedEdit | { error: string } {
  const opFields: Array<{
    key: keyof EditInput;
    kind: "entity" | "handler";
    op: "create" | "update" | "delete";
    isPayload: boolean;
  }> = [
    { key: "entityCreate", kind: "entity", op: "create", isPayload: true },
    { key: "entityUpdate", kind: "entity", op: "update", isPayload: true },
    { key: "entityDelete", kind: "entity", op: "delete", isPayload: false },
    { key: "handlerCreate", kind: "handler", op: "create", isPayload: true },
    { key: "handlerUpdate", kind: "handler", op: "update", isPayload: true },
    { key: "handlerDelete", kind: "handler", op: "delete", isPayload: false },
  ];
  const set = opFields.filter((f) => {
    const v = (item as Record<string, unknown>)[f.key];
    if (f.isPayload) return v !== undefined;
    return v === true;
  });
  if (set.length === 0) {
    return {
      error: `Edit ${index}: must set exactly one of entityCreate, entityUpdate, entityDelete, handlerCreate, handlerUpdate, or handlerDelete.`,
    };
  }
  if (set.length > 1) {
    return {
      error: `Edit ${index}: set ${set.length} operation fields (${set.map((f) => f.key).join(", ")}); each edit must set exactly one.`,
    };
  }
  if (!item.target) {
    return { error: `Edit ${index}: missing required 'target' field.` };
  }
  const chosen = set[0]!;
  const payload = chosen.isPayload ? (item as Record<string, unknown>)[chosen.key] : null;
  return { kind: chosen.kind, id: item.target, op: chosen.op, payload };
}

function validateEditAgainstWorld(
  edit: NormalizedEdit,
  { context, createdInBatch }: { context: ToolContext; createdInBatch: Set<string> },
): string | null {
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
