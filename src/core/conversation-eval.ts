import type { Entity, EntityStore } from "./entity.js";
import type { WordEntry, WordEffect, ConversationState } from "./conversation.js";
import { HandlerLib } from "./handler-lib.js";
import type { VerbContext, WorldEvent } from "./verb-types.js";
import { runSandboxed } from "./sandbox.js";

interface PerformContext {
  npc: Entity;
  player: Entity;
  room: Entity;
  store: EntityStore;
  word: string;
  state: ConversationState;
}

interface PerformResult {
  allowed: boolean;
  narration?: string;
  response?: string;
  effects?: WordEffect[];
  highlights?: string[];
}

/**
 * Evaluate a word entry's perform code string.
 *
 * The code receives: lib, npc, player, room, store, word, state
 * and should return a PerformResult object.
 */
export function evaluateWordPerform(
  entry: WordEntry,
  context: PerformContext,
): PerformResult | null {
  if (!entry.perform) return null;

  // Build a minimal VerbContext for HandlerLib
  const verbContext: VerbContext = {
    store: context.store,
    command: { form: "intransitive", verb: "talk" },
    player: context.player,
    room: context.room,
  };
  const lib = new HandlerLib(verbContext);

  const result = runSandboxed(entry.perform, {
    lib,
    npc: context.npc,
    player: context.player,
    room: context.room,
    store: context.store,
    word: context.word,
    state: {
      currentWord: context.state.currentWord,
      seenWords: Array.from(context.state.seenWords),
      knownWords: Array.from(context.state.knownWords),
    },
  });

  if (!result || typeof result !== "object") return null;
  const obj = result as Record<string, unknown>;
  if (typeof obj.allowed !== "boolean") return null;
  return {
    allowed: obj.allowed,
    narration: typeof obj.narration === "string" ? obj.narration : undefined,
    response: typeof obj.response === "string" ? obj.response : undefined,
    effects: Array.isArray(obj.effects) ? (obj.effects as WordEffect[]) : undefined,
    highlights: Array.isArray(obj.highlights) ? (obj.highlights as string[]) : undefined,
  };
}

/** Convert WordEffects into WorldEvents, applying them to the store */
export function applyConversationEffects(
  effects: WordEffect[],
  { store, npcId }: { store: EntityStore; npcId: string },
): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const effect of effects) {
    if (effect.type === "close-conversation") continue;

    const entityId = effect.entityId || npcId;
    if (effect.type === "set-property" && effect.property) {
      store.setProperty(entityId, { name: effect.property, value: effect.value });
      events.push({
        type: "set-property",
        entityId,
        property: effect.property,
        value: effect.value,
        description: effect.description || `Set ${effect.property}`,
      });
    } else if (effect.type === "move" && effect.property === "location") {
      store.setLocation(entityId, effect.value as string);
      events.push({
        type: "set-property",
        entityId,
        property: "location",
        value: effect.value,
        oldValue: effect.from,
        description: effect.description || "Moved entity",
      });
    }
  }
  return events;
}
