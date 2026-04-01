import type { GameInstance } from "../games/registry.js";
import type { ConversationResult, WordEntry } from "../core/conversation.js";
import { evaluateWordPerform } from "../core/conversation-eval.js";

/** Apply perform code from a matched word entry, if present */
export function applyPerformCode(
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
      (w.word && w.word.toLowerCase() === normalized) ||
      (w.aliases && w.aliases.some((a) => a && a.toLowerCase() === normalized)),
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
      ...performResult.highlights.filter(Boolean).map((h) => h.toLowerCase()),
    ];
    for (const h of performResult.highlights) {
      if (h) state.knownWords.add(h.toLowerCase());
    }
  }
  return updated;
}
