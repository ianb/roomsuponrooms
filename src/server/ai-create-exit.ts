import { generateObject } from "ai";
import { z } from "zod";
import type { EntityStore, Entity } from "../core/entity.js";
import type { GamePrompts } from "../core/game-data.js";
import { getLlm, getLlmProviderOptions } from "./llm.js";
import { describeProperties, collectTags, buildPropertiesSchema } from "./ai-prompt-helpers.js";
import { composeCreatePrompt } from "./ai-prompts.js";
import { saveAiEntity } from "./ai-entity-store.js";

export interface AiCreateExitResult {
  output: string;
  entityId: string | null;
  debug?: AiCreateExitDebugInfo;
}

export interface AiCreateExitDebugInfo {
  systemPrompt: string;
  prompt: string;
  response: unknown;
  schema?: unknown;
  durationMs: number;
}

const EXIT_EXCLUDED_PROPERTIES = [
  "name",
  "description",
  "location",
  "aliases",
  "direction",
  "destination",
  "destinationIntent",
];

function buildExitSchema(store: EntityStore) {
  return z.object({
    direction: z
      .string()
      .describe(
        "The direction label: north, south, east, west, up, down, northeast, northwest, southeast, southwest, or a custom direction like 'inside' or 'through the crack'.",
      ),
    name: z.string().describe("Display name for the exit, e.g. 'Wooden Door', 'Narrow Passage'."),
    description: z
      .string()
      .describe(
        "What the player sees when they examine this exit. Describe it from the current room's perspective. 1-2 sentences.",
      ),
    aliases: z
      .array(z.string())
      .describe("Alternative names the player can use to refer to this exit."),
    destinationIntent: z
      .string()
      .describe(
        "A description of what this exit should lead to when materialized. Include tone, setting details, and any constraints. This guides the AI that will create the destination room.",
      ),
    properties: buildPropertiesSchema(store, { exclude: EXIT_EXCLUDED_PROPERTIES }),
    notes: z
      .string()
      .describe(
        "Your reasoning about this exit. Explain what direction you chose and why, what the exit looks like from the current room, and what you envision on the other side. Flag if the instructions were vague or if the exit might conflict with existing ones. Shown to the game designer, not the player.",
      ),
  });
}

function describeEntityForLlm(entity: Entity): string {
  const tags = Array.from(entity.tags).join(", ");
  return `- ${entity.properties["name"] || entity.id} [${tags}]`;
}

function describeExitForLlm(entity: Entity): string {
  const dir = (entity.properties["direction"] as string) || "?";
  const dest = (entity.properties["destination"] as string) || "(unresolved)";
  const name = (entity.properties["name"] as string) || entity.id;
  return `- ${dir}: ${name} \u2192 ${dest}`;
}

function buildPrompt(
  store: EntityStore,
  { instructions, room }: { instructions: string; room: Entity },
): string {
  const parts: string[] = [];

  parts.push(`<user-request>\nai create exit ${instructions}\n</user-request>`);

  parts.push(
    `<current-room>\n- ${room.properties["name"] || room.id}: ${room.properties["description"] || "No description."}\n</current-room>`,
  );

  const contents = store.getContents(room.id);
  const exits = contents.filter((e) => e.tags.has("exit"));
  if (exits.length > 0) {
    parts.push(`<existing-exits>\n${exits.map(describeExitForLlm).join("\n")}\n</existing-exits>`);
  }

  const items = contents.filter((e) => !e.tags.has("exit") && !e.tags.has("player"));
  if (items.length > 0) {
    parts.push(`<room-contents>\n${items.map(describeEntityForLlm).join("\n")}\n</room-contents>`);
  }

  parts.push(`<available-properties>\n${describeProperties(store)}\n</available-properties>`);
  parts.push(`<existing-tags>\n${collectTags(store).join(", ")}\n</existing-tags>`);

  return parts.join("\n\n");
}

function buildSystemPrompt({
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
You are creating an exit for a text adventure game. The player has asked you to create a passage, door, or other connection leading out of the current room. The exit does not have a destination yet \u2014 another AI will create the destination room later when the player goes through it.
</role>

${styleSection}

<guidelines>
- Choose a direction that doesn't conflict with existing exits in the room.
- The exit description should describe what the player sees FROM the current room \u2014 the entrance to the passage, the door, the gap in the wall, etc.
- The destinationIntent should describe what you envision on the OTHER side. Be specific about atmosphere, setting, and any notable features. This guides the room creation AI.
- Use standard compass directions (north, south, east, west, up, down) when they make sense. Use custom directions ("inside", "through the crack") only when a compass direction doesn't fit.
- Set locked/open properties if appropriate. A locked exit needs an unlockedBy property pointing to a key entity.
- Keep the exit name short and descriptive: "Wooden Door", "Narrow Passage", "Iron Gate".
- Provide aliases that players might type: "door", "passage", "gate", etc.
</guidelines>`;
}

export async function handleAiCreateExit(
  store: EntityStore,
  {
    instructions,
    room,
    gameId,
    prompts,
    debug,
  }: {
    instructions: string;
    room: Entity;
    gameId: string;
    prompts?: GamePrompts;
    debug?: boolean;
  },
): Promise<AiCreateExitResult> {
  const systemPrompt = buildSystemPrompt({ prompts, room, store });
  const prompt = buildPrompt(store, { instructions, room });

  console.log("[ai-create-exit] Creating exit:", instructions);
  const startTime = Date.now();

  const objectSchema = buildExitSchema(store);
  const result = await generateObject({
    model: getLlm(),
    schema: objectSchema,
    system: systemPrompt,
    prompt,
    providerOptions: getLlmProviderOptions(),
  });

  const durationMs = Date.now() - startTime;
  const response = result.object;

  console.log(
    `[ai-create-exit] Created: ${response.name} (${response.direction}) (${durationMs}ms)`,
  );

  // Generate exit ID
  const roomSlug = room.id.replace("room:", "");
  const baseId = `exit:${roomSlug}:${response.direction.toLowerCase().replace(/\s+/g, "-")}`;
  let entityId = baseId;
  if (store.has(entityId)) {
    let n = 2;
    while (store.has(`${baseId}-${n}`)) {
      n += 1;
    }
    entityId = `${baseId}-${n}`;
  }

  const properties: Record<string, unknown> = {
    location: room.id,
    direction: response.direction,
    name: response.name,
    description: response.description,
    destinationIntent: response.destinationIntent,
  };
  for (const [key, value] of Object.entries(response.properties)) {
    if (value !== undefined) properties[key] = value;
  }
  if (response.aliases.length > 0) {
    properties.aliases = response.aliases;
  }

  store.create(entityId, { tags: ["exit"], properties });

  saveAiEntity({
    createdAt: new Date().toISOString(),
    gameId,
    id: entityId,
    tags: ["exit"],
    properties,
  });

  const debugInfo: AiCreateExitDebugInfo | undefined = debug
    ? { systemPrompt, prompt, response, schema: z.toJSONSchema(objectSchema), durationMs }
    : undefined;

  const summaryParts = [`[Created exit: ${response.name} (${response.direction})]`];
  summaryParts.push(response.description);
  summaryParts.push(`Intent: ${response.destinationIntent}`);
  if (response.notes) {
    summaryParts.push(`\nNotes: ${response.notes}`);
  }

  return { output: summaryParts.join("\n"), entityId, debug: debugInfo };
}
