import { generateObject } from "ai";
import { z } from "zod";
import type { EntityStore, Entity } from "../core/entity.js";
import type { ResolvedCommand, VerbHandler, WorldEvent } from "../core/verb-types.js";
import type { VerbRegistry } from "../core/verbs.js";
import { getLlm } from "./llm.js";
import type { AiHandlerRecord } from "./ai-handler-store.js";
import { saveHandlerRecord, recordToHandler } from "./ai-handler-store.js";
import { describeProperties, collectTags } from "./ai-prompt-helpers.js";

export interface FallbackDebugInfo {
  systemPrompt: string;
  prompt: string;
  response: unknown;
  durationMs: number;
}

/**
 * Result of the LLM deciding how to handle an unknown verb+object combination.
 * The LLM produces a reusable handler that is persisted to disk.
 */
export interface FallbackResult {
  output: string;
  events: WorldEvent[];
  /** The handler that was created and registered, if any */
  handler: VerbHandler | null;
  /** Debug info about the LLM call, included when debug mode is on */
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
      "JavaScript function body for perform handlers that need conditional logic. Only used when decision is 'perform'. Receives (object, player, room, store, command) as arguments. Must return { output: string, events: Array<{type, entityId, property, value, description}> }.",
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
    // Skip verbose text fields — the LLM doesn't need them to decide
    if (key === "description" || key === "shortDescription") continue;
    props[key] = value;
  }
  return `- id: ${entity.id}\n  tags: [${tags}]\n  properties: ${JSON.stringify(props)}`;
}

function buildPrompt(store: EntityStore, { command }: { command: ResolvedCommand }): string {
  const parts: string[] = [];

  parts.push(`## Action\nThe player typed: "${describeCommand(command)}"`);

  // Describe the target object(s) — this is what the handler is about
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
    parts.push(`## Target Object(s)\n${descs.join("\n\n")}`);
  }

  parts.push(`## Available Properties\n${describeProperties(store)}`);

  parts.push(`## Tags in World\n${collectTags(store).join(", ")}`);

  return parts.join("\n\n");
}

const SYSTEM_PROMPT = `You are the game engine for a text adventure. The player has attempted an action that has no built-in handler. You must decide whether this action should work for this type of object.

Your response creates a REUSABLE handler — it should make sense regardless of which room the player is in. Think about the object's nature (its tags, properties, description), not the current situation.

## Decision

You must choose one of:

- "perform" — the action makes physical/logical sense for this kind of object.
- "refuse" — you understand the intent, but this shouldn't work for this object. Give a specific, in-character reason in "message".

## Refuse handlers

Set message to a specific, in-character explanation of why it fails based on the object's nature. Never use generic refusals like "You can't do that."

Example: "The lantern is made of solid brass — you can't break it with your bare hands."

## Perform handlers

For perform, you can respond in two ways:

### Simple (no code): static message + events
Use "message" for the output text and "events" for property changes. Good for actions with a fixed outcome.

### With code: JavaScript function body
Use "code" for handlers that need conditional logic (checking properties, different outcomes based on state). The code is a JavaScript function body that receives these arguments:

- object — the target entity: { id, tags (Set), properties (object) }
- player — the player entity (same shape)
- room — the current room entity
- store — the entity store, with methods:
  - store.get(id) — get entity by ID
  - store.tryGet(id) — get entity or null
  - store.getContents(id) — get entities located inside this entity
  - store.findByTag(tag) — find all entities with a given tag
- command — the parsed command

Entity shape: { id: string, tags: Set<string>, properties: { [name]: value } }
- entity.tags.has("flame-source") — check if an entity has a tag
- entity.properties.lit — read a property
- entity.properties["name"] — read a property by string key

The code MUST return: { output: string, events: Array<{type: "set-property", entityId: string, property: string, value: any, description: string}> }

## Tags

Tags categorize entities and are used to write generic handlers. For example, a "light candle" handler should not check for a specific tinderbox — it should check if the player is carrying anything with the "flame-source" tag. This way any flame source (tinderbox, matches, lit torch) will work.

Use store.getContents(player.id) to check what the player is carrying, then filter by tag. The "Tags in World" section lists all tags currently in use.

## Code examples

Light a candle (requires a flame source in inventory):
\`\`\`
var carried = store.getContents(player.id);
var flameSrc = carried.filter(function(e) { return e.tags.has("flame-source"); });
if (flameSrc.length === 0) {
  return { output: "You have nothing to light it with.", events: [] };
}
if (object.properties.lit) {
  return { output: "The candle is already lit.", events: [] };
}
return {
  output: "You strike the " + flameSrc[0].properties.name + " and light the candle.",
  events: [{ type: "set-property", entityId: object.id, property: "lit", value: true, description: "Candle lit" }]
};
\`\`\`

Eat something (moves it to void):
\`\`\`
return {
  output: "You eat the food. Not bad!",
  events: [
    { type: "set-property", entityId: object.id, property: "location", value: "void", description: "Food consumed" }
  ]
};
\`\`\`

Shake lantern (different output based on state):
\`\`\`
if (object.properties.switchedOn) {
  return { output: "The lantern flickers as you shake it.", events: [] };
}
return { output: "The lantern rattles. You hear liquid sloshing inside.", events: [] };
\`\`\`

## Events

Property changes. Each event: { type: "set-property", entityId, property, value, description }.
Property names MUST come from the Available Properties list. Do not invent new properties.

## Guidelines

- Be conservative. Most unusual actions should be refused.
- Only "perform" if physically plausible given the object's tags and properties.
- Do not destroy important game objects without very good reason.
- A "perform" with no events is fine — flavor text is good.
- Prefer code over static message+events when the handler should react to object state.
- Keep output to 1-2 sentences in classic text adventure style.`;

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
    debug,
  }: {
    command: ResolvedCommand;
    player: Entity;
    room: Entity;
    verbs: VerbRegistry;
    gameId: string;
    debug?: boolean;
  },
): Promise<FallbackResult> {
  const prompt = buildPrompt(store, { command });

  console.log("[ai-fallback] Calling LLM for:", describeCommand(command));
  const startTime = Date.now();

  const result = await generateObject({
    model: getLlm(),
    schema: fallbackResponseSchema,
    system: SYSTEM_PROMPT,
    prompt,
  });

  const durationMs = Date.now() - startTime;
  const response = result.object;

  console.log(
    `[ai-fallback] Decision: ${response.decision} (${durationMs}ms) — "${response.message}"`,
  );

  // Get the target entity for the handler
  const targetEntity =
    command.form === "transitive" || command.form === "prepositional"
      ? command.object
      : command.form === "ditransitive"
        ? command.object
        : null;

  // Build the serializable record
  const record: AiHandlerRecord = {
    createdAt: new Date().toISOString(),
    gameId,
    decision: response.decision,
    verb: command.verb,
    form: command.form,
    entityId: targetEntity ? targetEntity.id : undefined,
    message: response.message,
    eventTemplates: response.events,
    code: response.code,
  };

  // Persist and register
  saveHandlerRecord(record);
  const handler = recordToHandler(record);
  verbs.register(handler);

  const debugInfo: FallbackDebugInfo | undefined = debug
    ? { systemPrompt: SYSTEM_PROMPT, prompt, response, durationMs }
    : undefined;

  if (response.decision === "refuse") {
    return { output: response.message, events: [], handler, debug: debugInfo };
  }

  // Execute immediately for the current command
  const performResult = handler.perform({ store, command, player, room });

  // Apply events
  for (const event of performResult.events) {
    if (event.type === "set-property" && event.property) {
      store.setProperty(event.entityId, { name: event.property, value: event.value });
    }
  }

  return { output: performResult.output, events: performResult.events, handler, debug: debugInfo };
}
