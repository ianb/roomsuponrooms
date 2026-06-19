import type { GameInstance } from "../games/registry.js";
import {
  startConversation,
  processWord,
  highlightTopics,
  ConversationNoMatchError,
} from "../core/conversation.js";
import type { ConversationResult, ConversationState, WordEntry } from "../core/conversation.js";
import { applyConversationEffects } from "../core/conversation-eval.js";
import { getStorage } from "./storage-instance.js";
import type { AuthoringInfo, EventLogEntry, SessionKey } from "./storage.js";
import { handleAiConversationFallback, MAX_CONVERSATION_WORDS } from "./ai-conversation.js";
import { applyPerformCode } from "./conversation-perform.js";

interface ConversationResponse {
  output: string;
  conversationMode?: { npcName: string; knownWords: string[] } | null;
  debug?: unknown;
}

/**
 * Restore in-memory conversation state for an NPC after a fresh game init.
 * Used during event replay: a persisted start-conversation event reaches us
 * without the corresponding close-conversation marker, so we recreate enough
 * state for subsequent words (including `bye`) to be routed back through
 * handleConversationWord. seenWords are not reconstructed — we don't persist
 * per-word conversation events with enough metadata to replay them, so the
 * topic list may show stale-unseen status until the user revisits topics.
 */
export async function restoreConversationState(
  game: GameInstance,
  { npcId, gameId }: { npcId: string; gameId: string },
): Promise<void> {
  if (!game.store.has(npcId)) return;
  const npc = game.store.get(npcId);
  const initial = (game.conversations && game.conversations[npcId]) || null;
  const data = await loadConversationData(gameId, { npcId, initial });
  if (data.words.length === 0) return;
  const { state } = startConversation(data, { npc });
  game.conversationState = state;
}

/** Load conversation data for an NPC, merging initial game data with stored entries */
async function loadConversationData(
  gameId: string,
  { npcId, initial }: { npcId: string; initial: { words: WordEntry[]; closed?: boolean } | null },
): Promise<{ words: WordEntry[]; closed?: boolean }> {
  const words: WordEntry[] = initial ? [...initial.words] : [];
  const stored = await getStorage().loadConversationEntries(gameId, npcId);
  words.push(...stored);
  return { words, closed: initial ? initial.closed : undefined };
}

/** Handle "talk to [npc]" — start a conversation */
export async function handleTalkTo(
  game: GameInstance,
  { npcId, session, authoring }: { npcId: string; session: SessionKey; authoring: AuthoringInfo },
): Promise<ConversationResponse> {
  const npc = game.store.get(npcId);
  const npcName = npc.name;

  const initial = (game.conversations && game.conversations[npcId]) || null;
  const data = await loadConversationData(session.gameId, { npcId, initial });

  if (data.words.length === 0 && !data.closed) {
    // No conversation data — try AI to generate an initial greeting
    const players = game.store.findByTag("player");
    const player = players[0];
    if (player) {
      const roomId = player.location;
      const room = game.store.get(roomId);
      const tempState: ConversationState = {
        npcId,
        currentWord: null,
        seenWords: new Set(),
        knownWords: new Set(),
      };
      const aiResult = await handleAiConversationFallback(game.store, {
        word: "hello",
        npc,
        room,
        state: tempState,
        existingWords: [],
        session,
        prompts: game.prompts,
        authoring,
      });
      if (aiResult.entry) {
        aiResult.entry.conditions = { first: true };
        aiResult.entry.aliases = ["hi", "hey", "greetings"];
        data.words.push(aiResult.entry);
      }
    }
  }

  if (data.words.length === 0) {
    return {
      output: `{!${npcName} has nothing to say.!}`,
      conversationMode: null,
    };
  }

  const { state, greeting } = startConversation(data, { npc });
  game.conversationState = state;

  const output = highlightTopics(greeting.output, greeting.knownWords);

  if (greeting.events.length > 0) {
    const events = applyConversationEffects(greeting.events, {
      store: game.store,
      npcId,
    });
    if (events.length > 0) {
      const entry: EventLogEntry = {
        command: `talk to ${npcName}`,
        events,
        output,
        timestamp: new Date().toISOString(),
      };
      await getStorage().appendEvent(session, entry);
    }
  }

  return {
    output,
    conversationMode: { npcName, knownWords: greeting.knownWords },
  };
}

/** Check command result events for a start-conversation event */
export async function checkForConversationStart(
  game: GameInstance,
  {
    events,
    session,
    authoring,
  }: {
    events: Array<{ type: string; entityId: string }>;
    session: SessionKey;
    authoring: AuthoringInfo;
  },
): Promise<{
  output: string;
  conversationMode: { npcName: string; knownWords: string[] } | null;
} | null> {
  const startEvent = events.find((e) => e.type === "start-conversation");
  if (!startEvent) return null;
  const result = await handleTalkTo(game, { npcId: startEvent.entityId, session, authoring });
  return {
    output: result.output,
    conversationMode: result.conversationMode || null,
  };
}

/** Handle a single word during an active conversation */
export async function handleConversationWord(
  game: GameInstance,
  { word, session, authoring }: { word: string; session: SessionKey; authoring: AuthoringInfo },
): Promise<ConversationResponse> {
  const state = game.conversationState;
  if (!state) {
    return { output: "You are not in a conversation.", conversationMode: null };
  }

  const npc = game.store.get(state.npcId);
  const npcName = npc.name;
  const initial = (game.conversations && game.conversations[state.npcId]) || null;
  const data = await loadConversationData(session.gameId, { npcId: state.npcId, initial });

  let result: ConversationResult;
  try {
    result = processWord(data, { word, npc, state });
  } catch (err: unknown) {
    if (err instanceof ConversationNoMatchError) {
      return handleUnknownWord(game, {
        word: err.word,
        npcName,
        session,
        data,
        authoring,
      });
    }
    throw err as Error;
  }

  // Check for perform code on the matched entry
  result = await applyPerformCode(game, { word, npc, result, data });

  const output = highlightTopics(result.output, result.knownWords);

  // Apply effects
  if (result.events.length > 0) {
    const events = applyConversationEffects(result.events, {
      store: game.store,
      npcId: state.npcId,
    });
    if (events.length > 0) {
      const entry: EventLogEntry = {
        command: word,
        events,
        output,
        timestamp: new Date().toISOString(),
      };
      await getStorage().appendEvent(session, entry);
    }
  }

  if (result.closeConversation) {
    await persistCloseConversation(session, { npcId: state.npcId, word });
    game.conversationState = undefined;
    return { output, conversationMode: null };
  }

  return {
    output,
    conversationMode: { npcName, knownWords: result.knownWords },
  };
}

/**
 * Persist a close-conversation event so subsequent reinits know the
 * conversation has ended and don't try to restore it.
 */
async function persistCloseConversation(
  session: SessionKey,
  { npcId, word }: { npcId: string; word: string },
): Promise<void> {
  const entry: EventLogEntry = {
    command: word,
    events: [{ type: "close-conversation", entityId: npcId, description: "Conversation closed" }],
    output: "",
    timestamp: new Date().toISOString(),
  };
  await getStorage().appendEvent(session, entry);
}

/** Handle an unknown word — either reject (closed/full) or call AI */
async function handleUnknownWord(
  game: GameInstance,
  {
    word,
    npcName,
    session,
    data,
    authoring,
  }: {
    word: string;
    npcName: string;
    session: SessionKey;
    data: { words: WordEntry[]; closed?: boolean };
    authoring: AuthoringInfo;
  },
): Promise<ConversationResponse> {
  const state = game.conversationState!;
  const knownWords = Array.from(state.knownWords);

  // Closed conversations always reject
  if (data.closed) {
    return {
      output: `{!${npcName} doesn't respond to that.!}`,
      conversationMode: { npcName, knownWords },
    };
  }

  // Auto-close if conversation has grown too large
  if (data.words.length >= MAX_CONVERSATION_WORDS) {
    return {
      output: `{!${npcName} doesn't respond to that.!}`,
      conversationMode: { npcName, knownWords },
    };
  }

  // AI fallback
  const npc = game.store.get(state.npcId);
  const players = game.store.findByTag("player");
  const player = players[0];
  if (!player) {
    return {
      output: `{!${npcName} doesn't respond to that.!}`,
      conversationMode: { npcName, knownWords },
    };
  }
  const roomId = player.location;
  const room = game.store.get(roomId);

  const aiResult = await handleAiConversationFallback(game.store, {
    word,
    npc,
    room,
    state,
    existingWords: data.words,
    session,
    prompts: game.prompts,
    authoring,
  });

  if (!aiResult.entry) {
    const rejection =
      aiResult.rejectionType === "no-words"
        ? "{!You can't find the words to say that.!}"
        : `{!${npcName} doesn't respond to that.!}`;
    return {
      output: rejection,
      conversationMode: { npcName, knownWords },
    };
  }

  // AI created a new entry — apply it
  state.seenWords.add(word);
  state.currentWord = word;
  if (aiResult.entry.highlights) {
    for (const h of aiResult.entry.highlights) {
      if (h) state.knownWords.add(h.toLowerCase());
    }
  }

  // Apply effects from AI-generated entry
  let closeConversation = false;
  const parts: string[] = [];
  if (aiResult.entry.narration) parts.push(aiResult.entry.narration);
  if (aiResult.entry.response) parts.push(aiResult.entry.response);
  const newKnownWords = Array.from(state.knownWords);
  const output = highlightTopics(parts.join("\n"), newKnownWords);
  if (aiResult.entry.effects && aiResult.entry.effects.length > 0) {
    const events = applyConversationEffects(aiResult.entry.effects, {
      store: game.store,
      npcId: state.npcId,
    });
    closeConversation = aiResult.entry.effects.some((e) => e.type === "close-conversation");
    if (events.length > 0) {
      const logEntry: EventLogEntry = {
        command: word,
        events,
        output,
        timestamp: new Date().toISOString(),
      };
      await getStorage().appendEvent(session, logEntry);
    }
  }

  if (closeConversation) {
    await persistCloseConversation(session, { npcId: state.npcId, word });
    game.conversationState = undefined;
    return { output, conversationMode: null };
  }

  return {
    output,
    conversationMode: { npcName, knownWords: newKnownWords },
  };
}
