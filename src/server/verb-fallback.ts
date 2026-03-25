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

export interface FallbackResult {
  output: string;
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

function buildPrompt(store: EntityStore, { command }: { command: ResolvedCommand }): string {
  const parts: string[] = [];

  parts.push(`## Action\nThe player typed: "${describeCommand(command)}"`);

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
Use "code" for handlers that need conditional logic (checking properties, different outcomes based on state).

The code has access to these variables:

- object — the target entity: { id, tags (Set), properties (object) }
- player — the player entity (same shape)
- room — the current room entity
- store — the entity store:
  - store.get(id) — get entity by ID
  - store.tryGet(id) — get entity or null
  - store.getContents(id) — get entities inside this entity
  - store.findByTag(tag) — find all entities with a tag
- command — the parsed command
- lib — helper library with common operations:
  - lib.result(message) — return a simple result with no state changes
  - lib.ref(entity) — display name for output text
  - lib.setEvent(entityId, {property, value, description}) — create a property change event
  - lib.moveEvent(entityId, {to, from, description}) — create a location change event
  - lib.carried() — entities the player is carrying
  - lib.contents(entityId) — entities inside a container
  - lib.findKey(object) — find the matching key in player inventory
  - lib.take(object) — pick up an object (returns result + events)
  - lib.drop(object) — drop an object
  - lib.open(object) / lib.close(object)
  - lib.switchOn(object) / lib.switchOff(object)

Entity shape: { id: string, tags: Set<string>, properties: { [name]: value } }

The code MUST return: { output: string, events: WorldEvent[] }

## Tags

Tags categorize entities and are used to write generic handlers. For example, a "light candle" handler should not check for a specific tinderbox — it should check if the player is carrying anything with the "flame-source" tag. This way any flame source (tinderbox, matches, lit torch) will work.

Use lib.carried() to check what the player is carrying, then filter by tag. The "Tags in World" section lists all tags currently in use.

## Code examples

Light a candle (requires a flame source in inventory):
\`\`\`
var carried = lib.carried();
var flameSrc = carried.filter(function(e) { return e.tags.has("flame-source"); });
if (flameSrc.length === 0) {
  return lib.result("You have nothing to light it with.");
}
if (object.properties.lit) {
  return lib.result("The candle is already lit.");
}
return {
  output: "You strike the " + lib.ref(flameSrc[0]) + " and light the candle.",
  events: [lib.setEvent(object.id, { property: "lit", value: true, description: "Candle lit" })]
};
\`\`\`

Eat something (moves it to void):
\`\`\`
return {
  output: "You eat the " + lib.ref(object) + ". Not bad!",
  events: [lib.moveEvent(object.id, { to: "void", from: object.properties.location, description: "Food consumed" })]
};
\`\`\`

Shake lantern (different output based on state):
\`\`\`
if (object.properties.switchedOn) {
  return lib.result("The lantern flickers as you shake it.");
}
return lib.result("The lantern rattles. You hear liquid sloshing inside.");
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
 * Convert the LLM response into a perform code string for HandlerData.
 */
function buildPerformCode(response: {
  decision: "perform" | "refuse";
  message: string;
  code?: string;
  events: Array<{ type: string; property: string; value: unknown; description: string }>;
}): string {
  if (response.decision === "refuse") {
    return `return lib.result(${JSON.stringify(response.message)});`;
  }

  if (response.code) {
    return response.code;
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
