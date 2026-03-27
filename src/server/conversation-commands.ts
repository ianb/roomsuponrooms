import type { GameInstance } from "../games/registry.js";
import {
  startConversation,
  processWord,
  highlightTopics,
  ConversationNoMatchError,
} from "../core/conversation.js";
import type { ConversationResult, WordEntry } from "../core/conversation.js";
import { evaluateWordPerform, applyConversationEffects } from "../core/conversation-eval.js";
import { loadConversationData } from "./conversation-store.js";
import { appendEventLog } from "./event-log.js";
import { handleAiConversationFallback, MAX_CONVERSATION_WORDS } from "./ai-conversation.js";

interface ConversationResponse {
  output: string;
  conversationMode?: { npcName: string; knownWords: string[] } | null;
  debug?: unknown;
}

/** Handle "talk to [npc]" — start a conversation */
export function handleTalkTo(
  game: GameInstance,
  { npcId, gameId }: { npcId: string; gameId: string },
): ConversationResponse {
  const npc = game.store.get(npcId);
  const npcName = (npc.properties["name"] as string) || npc.id;

  const initial = (game.conversations && game.conversations[npcId]) || null;
  const data = loadConversationData(gameId, { npcId, initial });

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
      appendEventLog(gameId, {
        command: `talk to ${npcName}`,
        events,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return {
    output,
    conversationMode: { npcName, knownWords: greeting.knownWords },
  };
}

/** Check command result events for a start-conversation event */
export function checkForConversationStart(
  game: GameInstance,
  { events, gameId }: { events: Array<{ type: string; entityId: string }>; gameId: string },
): { output: string; conversationMode: { npcName: string; knownWords: string[] } | null } | null {
  const startEvent = events.find((e) => e.type === "start-conversation");
  if (!startEvent) return null;
  const result = handleTalkTo(game, { npcId: startEvent.entityId, gameId });
  return {
    output: result.output,
    conversationMode: result.conversationMode || null,
  };
}

/** Handle a single word during an active conversation */
export async function handleConversationWord(
  game: GameInstance,
  { word, gameId }: { word: string; gameId: string },
): Promise<ConversationResponse> {
  const state = game.conversationState;
  if (!state) {
    return { output: "You are not in a conversation.", conversationMode: null };
  }

  const npc = game.store.get(state.npcId);
  const npcName = (npc.properties["name"] as string) || npc.id;
  const initial = (game.conversations && game.conversations[state.npcId]) || null;
  const data = loadConversationData(gameId, { npcId: state.npcId, initial });

  let result: ConversationResult;
  try {
    result = processWord(data, { word, npc, state });
  } catch (err: unknown) {
    if (err instanceof ConversationNoMatchError) {
      return handleUnknownWord(game, {
        word: err.word,
        npcName,
        gameId,
        data,
      });
    }
    throw err as Error;
  }

  // Check for perform code on the matched entry
  result = applyPerformCode(game, { word, npc, result, data });

  // Apply effects
  if (result.events.length > 0) {
    const events = applyConversationEffects(result.events, {
      store: game.store,
      npcId: state.npcId,
    });
    if (events.length > 0) {
      appendEventLog(gameId, {
        command: word,
        events,
        timestamp: new Date().toISOString(),
      });
    }
  }

  const output = highlightTopics(result.output, result.knownWords);

  if (result.closeConversation) {
    game.conversationState = undefined;
    return { output, conversationMode: null };
  }

  return {
    output,
    conversationMode: { npcName, knownWords: result.knownWords },
  };
}

/** Handle an unknown word — either reject (closed/full) or call AI */
async function handleUnknownWord(
  game: GameInstance,
  {
    word,
    npcName,
    gameId,
    data,
  }: {
    word: string;
    npcName: string;
    gameId: string;
    data: { words: WordEntry[]; closed?: boolean };
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
  const roomId = player.properties["location"] as string;
  const room = game.store.get(roomId);

  const aiResult = await handleAiConversationFallback(game.store, {
    word,
    npc,
    room,
    state,
    existingWords: data.words,
    gameId,
    prompts: game.prompts,
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
      state.knownWords.add(h.toLowerCase());
    }
  }

  const parts: string[] = [];
  if (aiResult.entry.narration) parts.push(aiResult.entry.narration);
  if (aiResult.entry.response) parts.push(aiResult.entry.response);
  const newKnownWords = Array.from(state.knownWords);
  const output = highlightTopics(parts.join("\n"), newKnownWords);

  return {
    output,
    conversationMode: { npcName, knownWords: newKnownWords },
  };
}

/** Apply perform code from a matched word entry, if present */
function applyPerformCode(
  game: GameInstance,
  {
    word,
    npc,
    result,
    data,
  }: {
    word: string;
    npc: ReturnType<typeof game.store.get>;
    result: ConversationResult;
    data: { words: WordEntry[] };
  },
): ConversationResult {
  const state = game.conversationState!;
  const normalized = word.toLowerCase().trim();
  const matchedEntry = data.words.find(
    (w) =>
      w.word.toLowerCase() === normalized ||
      (w.aliases && w.aliases.some((a) => a.toLowerCase() === normalized)),
  );
  if (!matchedEntry || !matchedEntry.perform) return result;

  const players = game.store.findByTag("player");
  const player = players[0];
  if (!player) return result;

  const roomId = player.properties["location"] as string;
  const room = game.store.get(roomId);
  const performResult = evaluateWordPerform(matchedEntry, {
    npc,
    player,
    room,
    store: game.store,
    word,
    state,
  });
  if (!performResult) return result;

  if (!performResult.allowed) {
    const npcName = (npc.properties["name"] as string) || npc.id;
    return {
      ...result,
      output: performResult.response || `{!${npcName} doesn't respond to that.!}`,
    };
  }

  const updated = { ...result };
  if (performResult.narration) updated.output = performResult.narration;
  if (performResult.response) {
    updated.output = updated.output
      ? updated.output + "\n" + performResult.response
      : performResult.response;
  }
  if (performResult.effects) {
    updated.events = [...updated.events, ...performResult.effects];
  }
  if (performResult.highlights) {
    updated.knownWords = [
      ...updated.knownWords,
      ...performResult.highlights.map((h) => h.toLowerCase()),
    ];
    for (const h of performResult.highlights) {
      state.knownWords.add(h.toLowerCase());
    }
  }
  return updated;
}
