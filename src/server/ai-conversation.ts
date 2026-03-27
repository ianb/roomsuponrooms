import { generateObject } from "ai";
import { z } from "zod";
import type { Entity, EntityStore } from "../core/entity.js";
import type { ConversationState, WordEntry } from "../core/conversation.js";
import type { GamePrompts } from "../core/game-data.js";
import { getLlm, getLlmProviderOptions } from "./llm.js";
import { composeConversationPrompt } from "./ai-prompts.js";
import { getStorage } from "./storage-instance.js";
import type { SessionKey } from "./storage.js";

/** Max word entries before a conversation auto-closes to AI expansion */
export const MAX_CONVERSATION_WORDS = 30;

export interface AiConversationResult {
  entry: WordEntry | null;
  rejectionType: "no-words" | "no-response";
  durationMs: number;
}

const responseSchema = z.object({
  decision: z.enum(["respond", "no-words", "no-response"]).describe(
    `"respond" if the NPC would react to this topic.
"no-words" if the player would not know how to express this concept here.
"no-response" if the NPC ignores or refuses this topic.`,
  ),
  narration: z
    .string()
    .optional()
    .describe("What the player said (in quotes if speech). Only for respond."),
  response: z
    .string()
    .optional()
    .describe("NPC reaction (speech in quotes, actions as narration). Only for respond."),
  highlights: z
    .array(z.string())
    .describe("0-2 new topic words revealed by this response. Only for respond."),
  notes: z.string().describe("Your reasoning. Shown to game designer, not the player."),
});

function describeNpcForLlm(npc: Entity): string {
  const tags = Array.from(npc.tags).join(", ");
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(npc.properties)) {
    props[key] = value;
  }
  return `id: ${npc.id}\ntags: [${tags}]\nproperties: ${JSON.stringify(props)}`;
}

function describeExistingConversation(existingWords: WordEntry[]): string {
  const entries = existingWords.map((w) => {
    const parts = [`- "${w.word}"`];
    if (w.conditions) parts.push(`  conditions: ${JSON.stringify(w.conditions)}`);
    parts.push(`  narration: ${w.narration}`);
    parts.push(`  response: ${w.response}`);
    if (w.highlights && w.highlights.length > 0) {
      parts.push(`  highlights: ${w.highlights.join(", ")}`);
    }
    return parts.join("\n");
  });
  return entries.join("\n\n");
}

function buildSystemPrompt({
  npc,
  room,
  store,
  prompts,
}: {
  npc: Entity;
  room: Entity;
  store: EntityStore;
  prompts?: GamePrompts;
}): string {
  const styleSection = composeConversationPrompt({ prompts, room, store });

  return `<role>
You are extending the conversation tree for an NPC/device in a text adventure. The player has said a word that has no existing response. You must decide whether this NPC would respond to this topic, and if so, generate the response.

Your response becomes a permanent part of the conversation tree — it will be reused every time a player says this word to this NPC.
</role>

${styleSection}

<npc>
${describeNpcForLlm(npc)}
</npc>

<guidelines>
- The player can only say SINGLE WORDS. The word is a trigger, not literal speech.
- "narration" describes what the player actually said or did (use quotes for speech).
- "response" is what the NPC does or says (use quotes for speech, plain text for actions/expressions).
- If a word was highlighted (set up) by a previous response, strongly prefer "respond" — the game promised the player this would work.
- "no-words" means the player would not know how to express this. This is the softer rejection.
- "no-response" means the NPC ignores or refuses. This is a dead end and should feel final.
- Keep responses concise: 1-3 sentences.
- Highlights: 0-2 new topic words the response naturally leads to. Do not highlight words that already exist in the conversation.
- Stay consistent with the NPC's established personality, knowledge, and tone from the existing conversation entries.
- Study the existing conversation carefully — match its style, voice, and level of detail.
</guidelines>`;
}

function buildPrompt(
  word: string,
  { state, existingWords }: { state: ConversationState; existingWords: WordEntry[] },
): string {
  const parts: string[] = [];
  parts.push(`<player-word>${word}</player-word>`);

  parts.push(
    `<existing-conversation>\n${describeExistingConversation(existingWords)}\n</existing-conversation>`,
  );

  const known = Array.from(state.knownWords);
  if (known.length > 0) {
    parts.push(
      `<highlighted-words>\nThese words were highlighted by previous responses — the player expects them to work: ${known.join(", ")}\n</highlighted-words>`,
    );
  }

  if (state.currentWord) {
    parts.push(
      `<current-context>The player was just talking about: ${state.currentWord}</current-context>`,
    );
  }

  return parts.join("\n\n");
}

export async function handleAiConversationFallback(
  store: EntityStore,
  {
    word,
    npc,
    room,
    state,
    existingWords,
    session,
    prompts,
  }: {
    word: string;
    npc: Entity;
    room: Entity;
    state: ConversationState;
    existingWords: WordEntry[];
    session: SessionKey;
    prompts?: GamePrompts;
  },
): Promise<AiConversationResult> {
  const systemPrompt = buildSystemPrompt({ npc, room, store, prompts });
  const prompt = buildPrompt(word, { state, existingWords });

  console.log(`[ai-conversation] Calling LLM for word: "${word}" on ${npc.id}`);
  const startTime = Date.now();

  const result = await generateObject({
    model: getLlm(),
    schema: responseSchema,
    system: systemPrompt,
    prompt,
    providerOptions: getLlmProviderOptions(),
  });

  const durationMs = Date.now() - startTime;
  const response = result.object;
  console.log(`[ai-conversation] Decision: ${response.decision} (${durationMs}ms)`);

  if (response.decision !== "respond") {
    return { entry: null, rejectionType: response.decision, durationMs };
  }

  const entry: WordEntry = {
    word,
    narration: response.narration || `You say "${word}."`,
    response: response.response || "",
    highlights: response.highlights.length > 0 ? response.highlights : undefined,
  };

  // Persist the new word entry
  await getStorage().saveWordEntry({
    ...entry,
    createdAt: new Date().toISOString(),
    gameId: session.gameId,
    userId: session.userId,
    npcId: npc.id,
  });

  return { entry, rejectionType: "no-response", durationMs };
}
