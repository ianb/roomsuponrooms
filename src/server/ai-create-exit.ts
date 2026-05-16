import { generateObject } from "ai";
import { z } from "zod";
import type { EntityStore, Entity } from "../core/entity.js";
import type { GamePrompts } from "../core/game-data.js";
import { getLlm, getLlmProviderOptions, getLlmAbortSignal, getLlmModelId } from "./llm.js";
import { runLoggedAiCall } from "./ai-call-log.js";
import { describeProperties, collectTags, buildPropertiesSchema } from "./ai-prompt-helpers.js";
import { composeCreatePrompt } from "./ai-prompts.js";
import { getStorage } from "./storage-instance.js";
import type { AuthoringInfo, AiEntityRecord } from "./storage.js";
import { recordAiCall } from "./ai-quota.js";

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
  const tags = entity.tags.join(", ");
  return `- ${entity.name} [${tags}]`;
}

function describeExitForLlm(entity: Entity): string {
  const dir = (entity.exit && entity.exit.direction) || "?";
  const dest = (entity.exit && entity.exit.destination) || "(unresolved)";
  const name = entity.name;
  return `- ${dir}: ${name} \u2192 ${dest}`;
}

function buildPrompt(
  store: EntityStore,
  { instructions, room }: { instructions: string; room: Entity },
): string {
  const parts: string[] = [];

  parts.push(`<user-request>\nai create exit ${instructions}\n</user-request>`);

  parts.push(
    `<current-room>\n- ${room.name}: ${room.description || "No description."}\n</current-room>`,
  );

  const contents = store.getContents(room.id);
  const exits = contents.filter((e) => e.tags.includes("exit"));
  if (exits.length > 0) {
    parts.push(`<existing-exits>\n${exits.map(describeExitForLlm).join("\n")}\n</existing-exits>`);
  }

  const items = contents.filter((e) => !e.tags.includes("exit") && !e.tags.includes("player"));
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
    authoring,
  }: {
    instructions: string;
    room: Entity;
    gameId: string;
    prompts?: GamePrompts;
    debug?: boolean;
    authoring: AuthoringInfo;
  },
): Promise<AiCreateExitResult> {
  const systemPrompt = buildSystemPrompt({ prompts, room, store });
  const prompt = buildPrompt(store, { instructions, room });

  console.log("[ai-create-exit] Creating exit:", instructions);
  const startTime = Date.now();

  const objectSchema = buildExitSchema(store);
  const { result, callId: aiCallId } = await runLoggedAiCall(
    {
      gameId,
      userId: authoring.createdBy,
      kind: "exit",
      context: `ai create exit ${instructions} in ${room.id}`,
      model: getLlmModelId(),
      systemPrompt,
      prompt,
    },
    () =>
      generateObject({
        model: getLlm(),
        schema: objectSchema,
        system: systemPrompt,
        prompt,
        providerOptions: getLlmProviderOptions(),
        abortSignal: getLlmAbortSignal(),
      }),
  );

  const durationMs = Date.now() - startTime;
  await recordAiCall(authoring.createdBy, "ai-create-exit");
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

  const extraProps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(response.properties)) {
    if (value !== undefined) extraProps[key] = value;
  }

  const entityRecord: AiEntityRecord = {
    createdAt: new Date().toISOString(),
    gameId,
    id: entityId,
    tags: ["exit"],
    name: response.name,
    description: response.description,
    location: room.id,
    aliases: response.aliases.length > 0 ? response.aliases : undefined,
    exit: {
      direction: response.direction,
      destinationIntent: response.destinationIntent,
    },
    properties: Object.keys(extraProps).length > 0 ? extraProps : undefined,
    authoring: { ...authoring, aiCallId },
  };

  store.create(entityId, entityRecord);
  await getStorage().saveAiEntity(entityRecord);

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
