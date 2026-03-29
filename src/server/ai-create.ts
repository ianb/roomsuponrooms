import { generateObject } from "ai";
import { z } from "zod";
import type { EntityStore, Entity } from "../core/entity.js";
import type { GamePrompts } from "../core/game-data.js";
import { getLlm, getLlmProviderOptions } from "./llm.js";
import { describeProperties, collectTags, buildPropertiesSchema } from "./ai-prompt-helpers.js";
import { composeCreatePrompt } from "./ai-prompts.js";
import { getStorage } from "./storage-instance.js";
import type { AuthoringInfo } from "./storage.js";
import { removeMatchingScenery } from "./ai-scenery.js";

export interface AiCreateResult {
  output: string;
  entityId: string | null;
  debug?: AiCreateDebugInfo;
}

export interface AiCreateDebugInfo {
  systemPrompt: string;
  prompt: string;
  response: unknown;
  schema?: unknown;
  durationMs: number;
}

/** Properties that are handled as top-level fields, not in the properties sub-object */
const EXCLUDED_PROPERTIES = ["name", "description", "shortDescription", "location", "aliases"];

function buildCreateSchema(store: EntityStore) {
  return z.object({
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
    properties: buildPropertiesSchema(store, { exclude: EXCLUDED_PROPERTIES }),
    secret: z
      .string()
      .optional()
      .describe(
        "Optional hidden potential not obvious from the description. Guides future AI verb resolution but is never shown to the player. Should describe interactive possibilities: an unexpected use, a hidden connection, a reaction to specific conditions. 1-2 sentences. Not everything needs a secret.",
      ),
    notes: z
      .string()
      .describe(
        "Your reasoning about this creation. Explain what choices you made about tags, properties, and style. Flag if the request was vague, if the object might not fit the setting, if you had to guess at properties, or if the world data seems to be missing a tag or property this object needs. This is shown to the game designer, not the player.",
      ),
  });
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

  parts.push(`<user-request>\nai create ${description}\n</user-request>`);

  parts.push(
    `<current-room>\n- ${room.properties["name"] || room.id}: ${room.properties["description"] || "No description."}\n</current-room>`,
  );

  // Show what's already in the room
  const contents = store.getContents(room.id);
  const items = contents.filter((e) => !e.tags.has("exit") && !e.tags.has("player"));
  if (items.length > 0) {
    parts.push(`<room-contents>\n${items.map(describeEntityForLlm).join("\n")}\n</room-contents>`);
  }

  parts.push(`<available-properties>\n${describeProperties(store)}\n</available-properties>`);
  parts.push(`<existing-tags>\n${collectTags(store).join(", ")}\n</existing-tags>`);

  return parts.join("\n\n");
}

function buildCreateSystemPrompt({
  prompts,
  room,
  store,
}: {
  prompts?: GamePrompts;
  room: Entity;
  store: EntityStore;
}): string {
  const styleSection = composeCreatePrompt({ prompts, room, store });

  return `<role>
You are creating an object for a text adventure game. The player has asked you to create something, and you should produce an entity definition.
</role>

${styleSection}

<guidelines>
- The object should fit naturally in the current room.
- Use existing tags when they apply. Common tags:
  - "portable" — player can pick it up
  - "container" — can hold other items (also add "openable" if it can be opened/closed)
  - "device" — can be switched on/off
  - "npc" — a character
  - Create new tags when they represent a meaningful category (like "flame-source", "weapon", "edible")
- Use existing properties from the Available Properties list. Do NOT invent new property names.
- Set "portable" tag for anything the player should be able to carry.
- For large/immovable things, set the "fixed" PROPERTY to true (not as a tag) and set "takeRefusal" to a short in-character reason why it can't be taken (e.g., "The moss is growing directly on the cave wall."). Both go in properties, not tags.
- Provide good aliases — common synonyms the player might use.
- The description should be vivid but concise, 1-2 sentences. It's what the player sees when they examine the object or look at the room.
- For properties, only include non-default values. Don't set "open: false" or "locked: false" — those are defaults.
- The idSlug should be a short kebab-case identifier: "rusty-sword", "sleeping-cat", "oak-table".
- The idCategory groups the entity: "item", "npc", "furniture", etc.
</guidelines>`;
}

export async function handleAiCreate(
  store: EntityStore,
  {
    description,
    room,
    gameId,
    prompts,
    debug,
    authoring,
  }: {
    description: string;
    room: Entity;
    gameId: string;
    prompts?: GamePrompts;
    debug?: boolean;
    authoring?: AuthoringInfo;
  },
): Promise<AiCreateResult> {
  const systemPrompt = buildCreateSystemPrompt({ prompts, room, store });
  const prompt = buildPrompt(store, { description, room });

  console.log("[ai-create] Creating:", description);
  const startTime = Date.now();

  const objectSchema = buildCreateSchema(store);
  const result = await generateObject({
    model: getLlm(),
    schema: objectSchema,
    system: systemPrompt,
    prompt,
    providerOptions: getLlmProviderOptions(),
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

  // Build properties — strip undefined values from the typed properties object
  const properties: Record<string, unknown> = {
    location: room.id,
    name: response.name,
    description: response.description,
  };
  for (const [key, value] of Object.entries(response.properties)) {
    if (value !== undefined) properties[key] = value;
  }
  if (response.shortDescription) {
    properties.shortDescription = response.shortDescription;
  }
  if (response.aliases.length > 0) {
    properties.aliases = response.aliases;
  }
  if (response.secret) {
    properties.secret = response.secret;
  }

  // Create the entity
  store.create(entityId, {
    tags: response.tags,
    properties,
  });

  // Persist
  await getStorage().saveAiEntity({
    createdAt: new Date().toISOString(),
    gameId,
    id: entityId,
    tags: response.tags,
    properties,
    authoring,
  });

  // Remove any scenery entries that match the new entity's name/aliases
  removeMatchingScenery(store, { room, name: response.name, aliases: response.aliases });

  const debugInfo: AiCreateDebugInfo | undefined = debug
    ? { systemPrompt, prompt, response, schema: z.toJSONSchema(objectSchema), durationMs }
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

  if (response.notes) {
    summaryParts.push(`\nNotes: ${response.notes}`);
  }

  return {
    output: summaryParts.join("\n"),
    entityId,
    debug: debugInfo,
  };
}
