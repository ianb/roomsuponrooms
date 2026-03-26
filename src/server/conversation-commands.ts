import type { GameInstance } from "../games/registry.js";
import {
  startConversation,
  processWord,
  highlightTopics,
  ConversationNoMatchError,
} from "../core/conversation.js";
import type { ConversationResult } from "../core/conversation.js";
import { evaluateWordPerform, applyConversationEffects } from "../core/conversation-eval.js";
import { loadConversationData } from "./conversation-store.js";
import { appendEventLog } from "./event-log.js";

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

  // Load conversation data from game files + AI-generated entries
  const initial = (game.conversations && game.conversations[npcId]) || null;
  const data = loadConversationData(gameId, { npcId, initial });

  if (data.words.length === 0) {
    return {
      output: `${npcName} has nothing to say.`,
      conversationMode: null,
    };
  }

  const { state, greeting } = startConversation(data, { npc });
  game.conversationState = state;

  const output = highlightTopics(greeting.output, greeting.knownWords);

  // Apply any greeting effects
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

/** Handle a single word during an active conversation */
export function handleConversationWord(
  game: GameInstance,
  { word, gameId }: { word: string; gameId: string },
): ConversationResponse {
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
      // TODO: AI fallback goes here in Phase 4
      const rejection =
        err.rejectionType === "no-words"
          ? "You can't find the words to say that."
          : `${npcName} doesn't respond to that.`;
      return {
        output: rejection,
        conversationMode: { npcName, knownWords: Array.from(state.knownWords) },
      };
    }
    throw err as Error;
  }

  // Check for perform code on the matched entry
  const matchedEntry = data.words.find((w) => {
    const normalized = word.toLowerCase().trim();
    return (
      w.word.toLowerCase() === normalized ||
      (w.aliases && w.aliases.some((a) => a.toLowerCase() === normalized))
    );
  });
  if (matchedEntry && matchedEntry.perform) {
    const players = game.store.findByTag("player");
    const player = players[0];
    if (player) {
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
      if (performResult) {
        if (!performResult.allowed) {
          return {
            output: performResult.response || `${npcName} doesn't respond to that.`,
            conversationMode: { npcName, knownWords: Array.from(state.knownWords) },
          };
        }
        if (performResult.narration) result.output = performResult.narration;
        if (performResult.response) {
          result.output = result.output
            ? result.output + "\n" + performResult.response
            : performResult.response;
        }
        if (performResult.effects) {
          result.events = [...result.events, ...performResult.effects];
        }
        if (performResult.highlights) {
          result.knownWords = [
            ...result.knownWords,
            ...performResult.highlights.map((h) => h.toLowerCase()),
          ];
          for (const h of performResult.highlights) {
            state.knownWords.add(h.toLowerCase());
          }
        }
      }
    }
  }

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
