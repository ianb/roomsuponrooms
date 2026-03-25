import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateObject } from "ai";
import { z } from "zod";
import type { EntityStore, Entity } from "../core/entity.js";
import { getLlm } from "./llm.js";
import { describeProperties, collectTags } from "./ai-prompt-helpers.js";

export interface AiCreateResult {
  output: string;
  entityId: string | null;
  debug?: AiCreateDebugInfo;
}

export interface AiCreateDebugInfo {
  prompt: string;
  response: unknown;
  durationMs: number;
}

const createResponseSchema = z.object({
  idSlug: z
    .string()
    .describe(
      'A short kebab-case slug for the entity ID, like "rusty-sword", "sleeping-cat", "oak-table". Will be prefixed with a category and uniquified.',
    ),
  idCategory: z.string().describe('Category prefix: "item", "npc", "furniture", etc.'),
  name: z
    .string()
    .describe("The display name of the object, e.g. 'Rusty Sword'. No trailing period."),
  description: z
    .string()
    .describe(
      "The full description shown when examining the object. 1-2 sentences, classic text adventure style.",
    ),
  shortDescription: z
    .string()
    .optional()
    .describe(
      'Short name variant for inventory/room listings. Only needed if it varies by state, e.g. "Candle (lit)" vs "Candle". Just a few words, not a sentence.',
    ),
  tags: z
    .array(z.string())
    .describe("Tags for this entity. Use existing tags from the Tags list when applicable."),
  aliases: z
    .array(z.string())
    .describe("Alternative names the player can use to refer to this object."),
  properties: z
    .record(z.string(), z.unknown())
    .describe(
      "Additional properties beyond name/description/location/aliases. Must use properties from the Available Properties list.",
    ),
});

// --- Persistence ---

interface AiEntityRecord {
  createdAt: string;
  gameId: string;
  entityId: string;
  tags: string[];
  properties: Record<string, unknown>;
}

function entityFilePath(gameId: string): string {
  return resolve(process.cwd(), `data/ai-entities-${gameId}.jsonl`);
}

function ensureDataDir(): void {
  const dataDir = resolve(process.cwd(), "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

function saveEntityRecord(record: AiEntityRecord): void {
  ensureDataDir();
  appendFileSync(entityFilePath(record.gameId), JSON.stringify(record) + "\n");
}

/** Get the set of AI-created entity IDs for a game */
export function getAiEntityIds(gameId: string): Set<string> {
  const filePath = entityFilePath(gameId);
  if (!existsSync(filePath)) return new Set();
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return new Set();
  const records = content.split("\n").map((line) => JSON.parse(line) as AiEntityRecord);
  return new Set(records.map((r) => r.entityId));
}

/** Remove an AI-created entity from the persistence file */
export function removeAiEntity(gameId: string, entityId: string): boolean {
  const filePath = entityFilePath(gameId);
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return false;
  const lines = content.split("\n");
  const filtered = lines.filter((line) => {
    const record = JSON.parse(line) as AiEntityRecord;
    return record.entityId !== entityId;
  });
  if (filtered.length === lines.length) return false;
  writeFileSync(filePath, filtered.length > 0 ? filtered.join("\n") + "\n" : "");
  return true;
}

/** Load all AI-created entities for a game and recreate them in the store */
export function loadAiEntities(gameId: string, store: EntityStore): void {
  const filePath = entityFilePath(gameId);
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return;
  const records = content.split("\n").map((line) => JSON.parse(line) as AiEntityRecord);
  for (const record of records) {
    if (store.has(record.entityId)) continue;
    store.create(record.entityId, {
      tags: record.tags,
      properties: record.properties,
    });
  }
}

// --- Prompt building ---

function describeEntityForLlm(entity: Entity): string {
  const tags = Array.from(entity.tags).join(", ");
  return `- ${entity.properties["name"] || entity.id} [${tags}]`;
}

function buildPrompt(
  store: EntityStore,
  { description, room }: { description: string; room: Entity },
): string {
  const parts: string[] = [];

  parts.push(`## Request\nCreate an object: "${description}"`);

  parts.push(
    `## Current Room\n- ${room.properties["name"] || room.id}: ${room.properties["description"] || "No description."}`,
  );

  // Show what's already in the room
  const contents = store.getContents(room.id);
  const items = contents.filter((e) => !e.tags.has("exit") && !e.tags.has("player"));
  if (items.length > 0) {
    parts.push(`## Already in Room\n${items.map(describeEntityForLlm).join("\n")}`);
  }

  parts.push(`## Available Properties\n${describeProperties(store)}`);
  parts.push(`## Existing Tags\n${collectTags(store).join(", ")}`);

  return parts.join("\n\n");
}

const SYSTEM_PROMPT = `You are creating an object for a text adventure game. The player has asked you to create something, and you should produce an entity definition.

## Guidelines

- The object should fit naturally in the current room.
- Use existing tags when they apply. Common tags:
  - "portable" — player can pick it up
  - "container" — can hold other items (also add "openable" if it can be opened/closed)
  - "device" — can be switched on/off
  - "npc" — a character
  - Create new tags when they represent a meaningful category (like "flame-source", "weapon", "edible")
- Use existing properties from the Available Properties list. Do NOT invent new property names.
- Set "portable" tag for anything the player should be able to carry.
- Set "fixed" property to true for large/immovable things.
- Provide good aliases — common synonyms the player might use.
- The description should be vivid but concise, 1-2 sentences, in classic text adventure style. It's what the player sees when they examine the object or look at the room.
- For properties, only include non-default values. Don't set "open: false" or "locked: false" — those are defaults.
- The idSlug should be a short kebab-case identifier: "rusty-sword", "sleeping-cat", "oak-table".
- The idCategory groups the entity: "item", "npc", "furniture", etc.`;

export async function handleAiCreate(
  store: EntityStore,
  {
    description,
    room,
    gameId,
    debug,
  }: { description: string; room: Entity; gameId: string; debug?: boolean },
): Promise<AiCreateResult> {
  const prompt = buildPrompt(store, { description, room });

  console.log("[ai-create] Creating:", description);
  const startTime = Date.now();

  const result = await generateObject({
    model: getLlm(),
    schema: createResponseSchema,
    system: SYSTEM_PROMPT,
    prompt,
  });

  const durationMs = Date.now() - startTime;
  const response = result.object;

  console.log(`[ai-create] Created: ${response.name} (${durationMs}ms)`);

  // Generate an ID like "item:rusty-sword", appending a number only if needed
  const baseId = `${response.idCategory}:${response.idSlug}`;
  let entityId = baseId;
  if (store.has(entityId)) {
    let n = 2;
    while (store.has(`${baseId}-${n}`)) {
      n += 1;
    }
    entityId = `${baseId}-${n}`;
  }

  // Build properties
  const properties: Record<string, unknown> = {
    location: room.id,
    name: response.name,
    description: response.description,
    ...response.properties,
  };
  if (response.shortDescription) {
    properties.shortDescription = response.shortDescription;
  }
  if (response.aliases.length > 0) {
    properties.aliases = response.aliases;
  }

  // Create the entity
  store.create(entityId, {
    tags: response.tags,
    properties,
  });

  // Persist
  saveEntityRecord({
    createdAt: new Date().toISOString(),
    gameId,
    entityId,
    tags: response.tags,
    properties,
  });

  const debugInfo: AiCreateDebugInfo | undefined = debug
    ? { prompt, response, durationMs }
    : undefined;

  // Build a summary of the created entity
  const entity = store.get(entityId);
  const summaryParts = [`[Created ${response.name} (${entityId})]`];
  summaryParts.push(response.description);
  const tagList = Array.from(entity.tags).join(", ");
  summaryParts.push(`Tags: ${tagList}`);
  const displayProps: string[] = [];
  for (const [key, value] of Object.entries(entity.properties)) {
    if (key === "location" || key === "name" || key === "description") continue;
    if (key === "aliases" && Array.isArray(value)) {
      displayProps.push(`Aliases: ${value.join(", ")}`);
    } else {
      displayProps.push(`${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
    }
  }
  if (displayProps.length > 0) {
    summaryParts.push(displayProps.join("\n"));
  }

  return {
    output: summaryParts.join("\n"),
    entityId,
    debug: debugInfo,
  };
}
