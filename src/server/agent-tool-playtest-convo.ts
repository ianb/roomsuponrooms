import {
  startConversation,
  processWord,
  highlightTopics,
  ConversationNoMatchError,
} from "../core/conversation.js";
import type { ConversationData, ConversationResult, WordEntry } from "../core/conversation.js";
import { applyConversationEffects } from "../core/conversation-eval.js";
import { applyPerformCode } from "./conversation-perform.js";
import { getStorage } from "./storage-instance.js";
import type { GameInstance } from "../games/registry.js";
import type { WorldEvent } from "../core/verb-types.js";
// Type-only import back into the playtest module (acceptable type-level cycle).
import type { PlaytestStep } from "./agent-tool-playtest.js";

/**
 * Hermetic conversation support for the playtest sandbox. Mirrors the live
 * conversation flow (conversation-commands.ts) with two deliberate
 * differences: nothing is persisted (no event log writes), and the AI
 * conversation fallback is DISABLED — an unknown word surfaces with a
 * diagnostic listing the stored words instead of generating a new entry.
 *
 * State lives on the sandbox GameInstance's own conversationState, exactly
 * like live play; it is discarded with the sandbox.
 */

export interface ConvoStepOutcome {
  output: string;
  events: WorldEvent[];
  /** Conversation still active after this step. */
  active: boolean;
  npcId: string;
  npcName?: string;
  knownWords?: string[];
  /** The word matched no stored entry (AI fallback is off in playtest). */
  unmatched?: boolean;
}

async function loadConvoData(
  game: GameInstance,
  { gameId, npcId }: { gameId: string; npcId: string },
): Promise<ConversationData> {
  const initial = (game.conversations && game.conversations[npcId]) || null;
  const words: WordEntry[] = initial ? [...initial.words] : [];
  const stored = await getStorage().loadConversationEntries(gameId, npcId);
  words.push(...stored);
  return { words, closed: initial ? initial.closed : undefined };
}

/** Begin a conversation in the sandbox after a start-conversation event. */
export async function startSandboxConversation(
  game: GameInstance,
  { gameId, npcId }: { gameId: string; npcId: string },
): Promise<ConvoStepOutcome> {
  const npc = game.store.get(npcId);
  const data = await loadConvoData(game, { gameId, npcId });
  if (data.words.length === 0) {
    return {
      output:
        `${npc.name} has nothing to say. (No stored conversation entries for "${npcId}"; ` +
        "in real play the conversation AI would improvise here, but it is disabled in playtest.)",
      events: [],
      active: false,
      npcId,
      npcName: npc.name,
    };
  }
  const { state, greeting } = startConversation(data, { npc });
  game.conversationState = state;
  const events = applyConversationEffects(greeting.events, { store: game.store, npcId });
  if (greeting.closeConversation) game.conversationState = undefined;
  return {
    output: highlightTopics(greeting.output, greeting.knownWords),
    events,
    active: !greeting.closeConversation,
    npcId,
    npcName: npc.name,
    knownWords: greeting.knownWords,
  };
}

/** Process one player input as a conversation word in the sandbox. */
export async function sandboxConversationWord(
  game: GameInstance,
  { gameId, word }: { gameId: string; word: string },
): Promise<ConvoStepOutcome> {
  const state = game.conversationState!;
  const npc = game.store.get(state.npcId);
  const data = await loadConvoData(game, { gameId, npcId: state.npcId });

  let result: ConversationResult;
  try {
    result = processWord(data, { word, npc, state });
  } catch (err: unknown) {
    if (err instanceof ConversationNoMatchError) {
      return {
        output: unmatchedDiagnostic(word, { npcName: npc.name, npcId: state.npcId, data, state }),
        events: [],
        active: true,
        npcId: state.npcId,
        npcName: npc.name,
        knownWords: Array.from(state.knownWords),
        unmatched: true,
      };
    }
    throw err as Error;
  }

  result = await applyPerformCode(game, { word, npc, result, data });
  const events = applyConversationEffects(result.events, { store: game.store, npcId: state.npcId });
  const output = highlightTopics(result.output, result.knownWords);

  if (result.closeConversation) {
    game.conversationState = undefined;
    return {
      output,
      events,
      active: false,
      npcId: state.npcId,
      npcName: npc.name,
      knownWords: result.knownWords,
    };
  }
  return {
    output,
    events,
    active: true,
    npcId: state.npcId,
    npcName: npc.name,
    knownWords: result.knownWords,
  };
}

/** Build a PlaytestStep from a conversation-word outcome. An unmatched word
 *  maps to "unresolved" (the AI fallback is disabled in the sandbox) so the
 *  playtest abort logic treats it like other failures. */
export function conversationStep(command: string, convo: ConvoStepOutcome): PlaytestStep {
  const step: PlaytestStep = {
    command,
    outcome: convo.unmatched ? "unresolved" : "conversation",
    output: convo.output,
    events: toStepEvents(convo.events),
  };
  if (convo.active) {
    step.conversation = {
      npcId: convo.npcId,
      npcName: convo.npcName || "",
      knownWords: convo.knownWords || [],
    };
  }
  return step;
}

export function toStepEvents(events: WorldEvent[]): PlaytestStep["events"] {
  return events.map((e) => ({
    type: e.type,
    entityId: e.entityId,
    property: e.property,
    value: e.value,
    description: e.description,
  }));
}

function unmatchedDiagnostic(
  word: string,
  {
    npcName,
    npcId,
    data,
    state,
  }: {
    npcName: string;
    npcId: string;
    data: ConversationData;
    state: { knownWords: Set<string> };
  },
): string {
  const stored = data.words
    .filter((w) => w.word && !(w.conditions && w.conditions.first))
    .map((w) =>
      w.aliases && w.aliases.length > 0 ? `${w.word} (aliases: ${w.aliases.join(", ")})` : w.word,
    );
  const known = Array.from(state.knownWords);
  return (
    `${npcName} doesn't respond to "${word}".\n` +
    "Conversation diagnostic: the AI conversation fallback is DISABLED in playtest, so only " +
    `stored word entries match. Stored words for "${npcId}": ` +
    `${stored.length > 0 ? stored.join("; ") : "(none)"}. ` +
    `Topics discovered so far: ${known.length > 0 ? known.join(", ") : "(none)"}. ` +
    'Say "bye" to end the conversation.'
  );
}
