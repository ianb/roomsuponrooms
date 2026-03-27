import { generateObject } from "ai";
import { z } from "zod";
import type { EntityStore, Entity } from "../core/entity.js";
import type { ResolvedCommand, VerbHandler, WorldEvent } from "../core/verb-types.js";
import type { VerbRegistry } from "../core/verbs.js";
import { getLlm, getLlmProviderOptions } from "./llm.js";
import type { AiHandlerRecord } from "./ai-handler-store.js";
import { saveHandlerRecord, recordToHandler } from "./ai-handler-store.js";
import { describeProperties, collectTags } from "./ai-prompt-helpers.js";
import type { HandlerLib } from "../core/handler-lib.js";
import type { GamePrompts } from "../core/game-data.js";
import { buildSystemPrompt } from "./verb-fallback-prompt.js";

export interface FallbackDebugInfo {
  systemPrompt: string;
  prompt: string;
  response: unknown;
  schema?: unknown;
  durationMs: number;
}

export interface FallbackResult {
  output: string;
  notes?: string;
  events: WorldEvent[];
  handler: VerbHandler | null;
  debug?: FallbackDebugInfo;
}

const fallbackResponseSchema = z.object({
  decision: z.enum(["perform", "refuse"]).describe(
    `"perform" if the action makes physical/logical sense for this type of object.
"refuse" if you understand the intent but the action shouldn't work.`,
  ),
  message: z
    .string()
    .describe(
      "For refuse: the refusal message. For perform without code: a static result message. For perform with code: a brief description of what the handler does (not shown to player).",
    ),
  code: z
    .string()
    .optional()
    .describe(
      "JavaScript function body for perform handlers that need conditional logic. Only used when decision is 'perform'. Has access to lib, object, player, room, store, command. Must return { output: string, events: WorldEvent[] }.",
    ),
  events: z
    .array(
      z.object({
        type: z.enum(["set-property"]),
        property: z.string(),
        value: z.unknown(),
        description: z.string(),
      }),
    )
    .describe(
      "Static property changes. Used for simple perform handlers without code. Properties must exist in the registry.",
    ),
  notes: z
    .string()
    .describe(
      "Your reasoning about this decision. Explain what choices you made and why. Flag if the action felt ambiguous, if you were unsure about the object's capabilities, if the handler might not generalize well, or if you think the world data may be missing something. This is shown to the game designer, not the player.",
    ),
});

function describeCommand(command: ResolvedCommand): string {
  if (command.form === "intransitive") return command.verb;
  if (command.form === "transitive") {
    return `${command.verb} ${entityName(command.object)}`;
  }
  if (command.form === "prepositional") {
    return `${command.verb} ${command.prep} ${entityName(command.object)}`;
  }
  return `${command.verb} ${entityName(command.object)} ${command.prep} ${entityName(command.indirect)}`;
}

function entityName(entity: Entity): string {
  return (entity.properties["name"] as string) || entity.id;
}

function describeEntityForLlm(entity: Entity): string {
  const tags = Array.from(entity.tags).join(", ");
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity.properties)) {
    if (key === "description" || key === "shortDescription") continue;
    props[key] = value;
  }
  return `- id: ${entity.id}\n  tags: [${tags}]\n  properties: ${JSON.stringify(props)}`;
}

function buildPrompt(
  store: EntityStore,
  { command, aiInstructions }: { command: ResolvedCommand; aiInstructions?: string },
): string {
  const parts: string[] = [];

  parts.push(`<user-action>\nThe player typed: "${describeCommand(command)}"\n</user-action>`);

  const involved: Entity[] = [];
  if (command.form === "transitive" || command.form === "prepositional") {
    involved.push(command.object);
  }
  if (command.form === "ditransitive") {
    involved.push(command.object, command.indirect);
  }

  if (involved.length > 0) {
    const descs = involved.map((e) => {
      const desc = (e.properties["description"] as string) || "No description.";
      return `${describeEntityForLlm(e)}\n  description: "${desc}"`;
    });
    parts.push(`<target-objects>\n${descs.join("\n\n")}\n</target-objects>`);
  }

  parts.push(`<available-properties>\n${describeProperties(store)}\n</available-properties>`);

  parts.push(`<world-tags>\n${collectTags(store).join(", ")}\n</world-tags>`);

  if (aiInstructions) {
    parts.push(
      `<designer-instructions>\nThe game designer says: ${aiInstructions}\n</designer-instructions>`,
    );
  }

  return parts.join("\n\n");
}

/**
 * Convert the LLM response into a perform code string for HandlerData.
 */
function buildPerformCode(response: {
  decision: "perform" | "refuse";
  message: string;
  code?: string;
  events: Array<{ type: string; property: string; value: unknown; description: string }>;
}): string {
  if (response.decision === "refuse") {
    return `return lib.result("{!" + ${JSON.stringify(response.message)} + "!}");`;
  }

  if (response.code) {
    // Fix common AI mistakes: accessing entity fields directly instead of via .properties
    return response.code
      .replace(/\bobject\.description\b/g, "object.properties.description")
      .replace(/\bobject\.name\b/g, "object.properties.name")
      .replace(/\bplayer\.location\b/g, "player.properties.location")
      .replace(/\broom\.description\b/g, "room.properties.description")
      .replace(/\broom\.name\b/g, "room.properties.name");
  }

  // Static message + events
  if (response.events.length === 0) {
    return `return lib.result(${JSON.stringify(response.message)});`;
  }

  const eventStrs = response.events.map(
    (e) =>
      `lib.setEvent(object.id, ${JSON.stringify({ property: e.property, value: e.value, description: e.description })})`,
  );
  return `return { output: ${JSON.stringify(response.message)}, events: [${eventStrs.join(", ")}] };`;
}

/**
 * Ask the LLM to handle an unrecognized verb+object combination.
 * If the LLM decides the action should work, a new VerbHandler is registered
 * so the same action will work again without another LLM call.
 */
export async function handleVerbFallback(
  store: EntityStore,
  {
    command,
    player,
    room,
    verbs,
    gameId,
    libClass,
    prompts,
    debug,
    aiInstructions,
  }: {
    command: ResolvedCommand;
    player: Entity;
    room: Entity;
    verbs: VerbRegistry;
    gameId: string;
    libClass: typeof HandlerLib;
    prompts?: GamePrompts;
    debug?: boolean;
    aiInstructions?: string;
  },
): Promise<FallbackResult> {
  const systemPrompt = buildSystemPrompt(libClass, { prompts, room, store });
  const prompt = buildPrompt(store, { command, aiInstructions });

  console.log("[ai-fallback] Calling LLM for:", describeCommand(command));
  const startTime = Date.now();

  const result = await generateObject({
    model: getLlm(),
    schema: fallbackResponseSchema,
    system: systemPrompt,
    prompt,
    providerOptions: getLlmProviderOptions(),
  });

  const durationMs = Date.now() - startTime;
  const response = result.object;

  console.log(
    `[ai-fallback] Decision: ${response.decision} (${durationMs}ms) — "${response.message}"`,
  );

  const targetEntity =
    command.form === "transitive" || command.form === "prepositional"
      ? command.object
      : command.form === "ditransitive"
        ? command.object
        : null;

  const handlerPrefix = response.decision === "refuse" ? "ai-refuse" : "ai-perform";
  const entitySuffix = targetEntity ? targetEntity.id : "intransitive";

  const record: AiHandlerRecord = {
    createdAt: new Date().toISOString(),
    gameId,
    name: `${handlerPrefix}:${command.verb}-${entitySuffix}`,
    pattern: { verb: command.verb, form: command.form },
    priority: -1,
    freeTurn: response.decision === "refuse",
    entityId: targetEntity ? targetEntity.id : undefined,
    perform: buildPerformCode(response),
  };

  saveHandlerRecord(record);
  const handler = recordToHandler(record);
  verbs.register(handler);

  const debugInfo: FallbackDebugInfo | undefined = debug
    ? { systemPrompt, prompt, response, schema: z.toJSONSchema(fallbackResponseSchema), durationMs }
    : undefined;

  const notes = response.notes || undefined;

  if (response.decision === "refuse") {
    return { output: `{!${response.message}!}`, notes, events: [], handler, debug: debugInfo };
  }

  // Execute immediately for the current command
  const performResult = handler.perform({ store, command, player, room });

  // Apply events
  for (const event of performResult.events) {
    if (event.type === "create-entity") {
      if (!store.has(event.entityId)) {
        const data = event.value as { tags: string[]; properties: Record<string, unknown> };
        store.create(event.entityId, { tags: data.tags, properties: data.properties });
      }
    } else if (event.type === "set-property" && event.property) {
      store.setProperty(event.entityId, { name: event.property, value: event.value });
    }
  }

  return {
    output: performResult.output,
    notes,
    events: performResult.events,
    handler,
    debug: debugInfo,
  };
}
