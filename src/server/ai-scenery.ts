import { generateObject } from "ai";
import { z } from "zod";
import type { Entity, EntityStore } from "../core/entity.js";
import type { GamePrompts } from "../core/game-data.js";
import { getLlm, getLlmProviderOptions } from "./llm.js";
import { composeVerbPrompt } from "./ai-prompts.js";

/** Cached scenery descriptions stored on the room entity */
export interface SceneryEntry {
  word: string;
  description: string;
  rejection: string;
}

const EXAMINE_VERBS = new Set([
  "examine",
  "x",
  "look",
  "l",
  "check",
  "describe",
  "read",
  "watch",
  "inspect",
  "study",
]);

const responseSchema = z.object({
  description: z
    .string()
    .describe("What the player sees when examining this detail. 1-3 vivid sentences."),
  rejection: z
    .string()
    .describe(
      "A short in-character response when the player tries to interact with this beyond looking. E.g. 'The banner is fastened high above your reach.'",
    ),
});

function buildSystemPrompt({
  room,
  store,
  prompts,
}: {
  room: Entity;
  store: EntityStore;
  prompts?: GamePrompts;
}): string {
  const styleSection = composeVerbPrompt({ prompts, room, store });
  return `<role>
You are describing a scenery detail in a text adventure room. The player is examining something mentioned in the room description. This is atmospheric detail, not a full game object — it exists to make the world feel richer.
</role>

${styleSection}

<guidelines>
- Write a vivid 1-3 sentence description of what the player sees on closer inspection.
- Stay consistent with the room description and world tone.
- The "rejection" is what happens if the player tries to take, use, or otherwise interact with this detail. Keep it brief and in-character.
- These are decorative/atmospheric elements — they should reward curiosity but not be interactive beyond looking.
</guidelines>`;
}

function buildPrompt({ word, room }: { word: string; room: Entity }): string {
  const roomName = (room.properties["name"] as string) || room.id;
  const roomDesc = (room.properties["description"] as string) || "";
  return `<room>
${roomName}: ${roomDesc}
</room>

<examine-word>${word}</examine-word>`;
}

/** Generate singular/plural variants of a word */
function wordVariants(word: string): string[] {
  const w = word.toLowerCase();
  const variants = [w];
  // singular → plural
  if (w.endsWith("y")) {
    variants.push(w.slice(0, -1) + "ies");
  }
  if (w.endsWith("s") || w.endsWith("sh") || w.endsWith("ch") || w.endsWith("x")) {
    variants.push(w + "es");
  }
  variants.push(w + "s");
  // plural → singular
  if (w.endsWith("ies")) {
    variants.push(w.slice(0, -3) + "y");
  } else if (w.endsWith("es")) {
    variants.push(w.slice(0, -2));
  } else if (w.endsWith("s") && !w.endsWith("ss")) {
    variants.push(w.slice(0, -1));
  }
  return [...new Set(variants)];
}

/** Check if a word (or a plural/singular variant) appears in the room description */
export function isSceneryWord(word: string, room: Entity): boolean {
  const description = (room.properties["description"] as string) || "";
  const lower = description.toLowerCase();
  const variants = wordVariants(word);
  for (const variant of variants) {
    const escaped = variant.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&");
    // eslint-disable-next-line security/detect-non-literal-regexp -- variant is escaped above
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");
    if (pattern.test(lower)) return true;
  }
  return false;
}

/** Check if a verb is an examine-type verb */
export function isExamineVerb(verb: string): boolean {
  return EXAMINE_VERBS.has(verb);
}

/** Get cached scenery entry for a word, if it exists */
export function getCachedScenery(room: Entity, word: string): SceneryEntry | null {
  const scenery = room.properties["scenery"] as SceneryEntry[] | undefined;
  if (!scenery) return null;
  const lower = word.toLowerCase();
  return scenery.find((s) => s.word.toLowerCase() === lower) || null;
}

/** Generate and cache a scenery description via AI */
export async function generateSceneryDescription(
  store: EntityStore,
  {
    word,
    room,
    prompts,
  }: {
    word: string;
    room: Entity;
    prompts?: GamePrompts;
  },
): Promise<{
  entry: SceneryEntry;
  debug?: {
    systemPrompt: string;
    prompt: string;
    response: unknown;
    schema?: unknown;
    durationMs: number;
  };
}> {
  // Check cache first
  const cached = getCachedScenery(room, word);
  if (cached) return { entry: cached };

  const systemPrompt = buildSystemPrompt({ room, store, prompts });
  const prompt = buildPrompt({ word, room });

  console.log(`[ai-scenery] Generating description for "${word}" in ${room.id}`);
  const startTime = Date.now();

  const result = await generateObject({
    model: getLlm(),
    schema: responseSchema,
    system: systemPrompt,
    prompt,
    providerOptions: getLlmProviderOptions(),
  });

  const durationMs = Date.now() - startTime;
  console.log(`[ai-scenery] Generated in ${durationMs}ms`);

  const entry: SceneryEntry = {
    word: word.toLowerCase(),
    description: result.object.description,
    rejection: result.object.rejection,
  };

  // Cache on the room entity
  const existing = (room.properties["scenery"] as SceneryEntry[]) || [];
  store.setProperty(room.id, {
    name: "scenery",
    value: [...existing, entry],
  });

  return {
    entry,
    debug: {
      systemPrompt,
      prompt,
      response: result.object,
      schema: z.toJSONSchema(responseSchema),
      durationMs,
    },
  };
}
