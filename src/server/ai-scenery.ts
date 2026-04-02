import { generateObject } from "ai";
import { z } from "zod";
import type { Entity, EntityStore } from "../core/entity.js";
import type { GamePrompts } from "../core/game-data.js";
import { getLlm, getLlmProviderOptions, getLlmAbortSignal } from "./llm.js";
import { composeVerbPrompt } from "./ai-prompts.js";

/** Scenery descriptions stored on the room entity */
export interface SceneryEntry {
  word: string;
  aliases?: string[];
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
  aliases: z
    .array(z.string())
    .describe(
      "Other words or short phrases the player might use to refer to this same detail. Include terms mentioned in your description that the player might want to examine further. 0-4 aliases.",
    ),
});

function buildSystemPrompt({
  room,
  store,
  sourceEntity,
  prompts,
}: {
  room: Entity;
  store: EntityStore;
  sourceEntity?: Entity;
  prompts?: GamePrompts;
}): string {
  const styleSection = composeVerbPrompt({ prompts, room, store });
  // Collect secrets from room and source entity
  const secrets: string[] = [];
  const roomSecret = room.secret;
  if (roomSecret) secrets.push(`Room: ${roomSecret}`);
  if (sourceEntity) {
    const s = sourceEntity.secret;
    if (s) secrets.push(`${sourceEntity.name}: ${s}`);
  }
  const secretSection =
    secrets.length > 0
      ? `\n<secret>\nHidden information. Be aware of it when describing scenery, but don't reveal it directly. If the word naturally relates to the secret, let hints emerge.\n\n${secrets.join("\n")}\n</secret>\n`
      : "";
  return `<role>
You are describing a detail the player wants to examine more closely. It may come from a room description, an object's description, or something mentioned in a recent interaction. Write atmospheric, vivid detail that rewards curiosity.
</role>

${styleSection}
${secretSection}
<guidelines>
- Write a vivid 1-3 sentence description of what the player sees on closer inspection.
- Stay consistent with the world tone and the context the word appeared in.
- The "rejection" is a brief response when the player tries to interact beyond looking.
- Include "aliases" — other words or phrases from your description that the player might want to examine next. This creates a chain of inspectable details.
</guidelines>`;
}

function buildPrompt(opts: {
  word: string;
  room: Entity;
  sourceEntity?: Entity;
  recentOutput?: string;
}): string {
  const parts: string[] = [];
  const roomName = opts.room.name;
  const roomDesc = opts.room.description;
  parts.push(`<room>\n${roomName}: ${roomDesc}\n</room>`);
  if (opts.sourceEntity) {
    const name = opts.sourceEntity.name;
    const desc = opts.sourceEntity.description;
    parts.push(`<source-object>\n${name}: ${desc}\n</source-object>`);
  }
  if (opts.recentOutput) {
    parts.push(`<recent-interaction>\n${opts.recentOutput}\n</recent-interaction>`);
  }
  parts.push(`<examine-word>${opts.word}</examine-word>`);
  return parts.join("\n\n");
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
  const description = room.description;
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

/** Check if a word appears in any visible item's description */
export function isItemSceneryWord(
  word: string,
  { store, roomId, playerId }: { store: EntityStore; roomId: string; playerId: string },
): { word: string; entityId: string } | null {
  const candidates = [...store.getContents(roomId), ...store.getContents(playerId)];
  const lower = word.toLowerCase();
  for (const entity of candidates) {
    if (entity.tags.includes("exit") || entity.tags.includes("player")) continue;
    const desc = entity.description;
    if (!desc) continue;
    const escaped = lower.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&");
    // eslint-disable-next-line security/detect-non-literal-regexp -- escaped above
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");
    if (pattern.test(desc)) {
      return { word, entityId: entity.id };
    }
  }
  return null;
}

/** Check if a verb is an examine-type verb */
export function isExamineVerb(verb: string): boolean {
  return EXAMINE_VERBS.has(verb);
}

/** Get stored scenery entry for a word, if it exists (checks word and aliases) */
export function getStoredScenery(entity: Entity, word: string): SceneryEntry | null {
  if (entity.scenery.length === 0) return null;
  const scenery = entity.scenery;
  const lower = word.toLowerCase();
  return (
    scenery.find((s) => {
      if (s.word.toLowerCase() === lower) return true;
      if (s.aliases) {
        return s.aliases.some((a) => a.toLowerCase() === lower);
      }
      return false;
    }) || null
  );
}

/** Remove scenery entries that match a name or aliases (e.g., when an entity is created) */
export function removeMatchingScenery(
  store: EntityStore,
  { room, name, aliases }: { room: Entity; name: string; aliases: string[] },
): void {
  if (room.scenery.length === 0) return;
  const words = new Set([name.toLowerCase(), ...aliases.map((a) => a.toLowerCase())]);
  const filtered = room.scenery.filter((s) => !words.has(s.word.toLowerCase()));
  if (filtered.length < room.scenery.length) {
    room.scenery = filtered;
  }
}

/** Generate and store a scenery description */
export async function generateSceneryDescription(
  store: EntityStore,
  {
    word,
    room,
    sourceEntity,
    recentOutput,
    prompts,
  }: {
    word: string;
    room: Entity;
    sourceEntity?: Entity;
    recentOutput?: string;
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
  // Always check/store scenery on the room
  const existing = getStoredScenery(room, word);
  if (existing) return { entry: existing };

  const systemPrompt = buildSystemPrompt({ room, store, sourceEntity, prompts });
  const prompt = buildPrompt({ word, room, sourceEntity, recentOutput });

  const label = sourceEntity ? `${sourceEntity.id}` : room.id;
  console.log(`[ai-scenery] Generating description for "${word}" on ${label}`);
  const startTime = Date.now();

  const result = await generateObject({
    model: getLlm(),
    schema: responseSchema,
    system: systemPrompt,
    prompt,
    providerOptions: getLlmProviderOptions(),
    abortSignal: getLlmAbortSignal(),
  });

  const durationMs = Date.now() - startTime;
  console.log(`[ai-scenery] Generated in ${durationMs}ms`);

  const entry: SceneryEntry = {
    word: word.toLowerCase(),
    aliases: result.object.aliases.length > 0 ? result.object.aliases : undefined,
    description: result.object.description,
    rejection: result.object.rejection,
  };

  // Store scenery on the source entity (or room if no source)
  const storeOn = sourceEntity || room;
  storeOn.scenery = [...storeOn.scenery, entry];

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
