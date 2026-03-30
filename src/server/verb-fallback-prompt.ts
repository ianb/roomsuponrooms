import type { Entity, EntityStore } from "../core/entity.js";
import type { ResolvedCommand } from "../core/verb-types.js";
import type { HandlerLib } from "../core/handler-lib.js";
import type { GamePrompts } from "../core/game-data.js";
import { composeVerbPrompt } from "./ai-prompts.js";
import { describeProperties, collectTags } from "./ai-prompt-helpers.js";

export function buildSystemPrompt(
  libClass: typeof HandlerLib,
  { prompts, room, store }: { prompts?: GamePrompts; room: Entity; store: EntityStore },
): string {
  const libLines = libClass
    .describeLib()
    .map((line) => `  - ${line}`)
    .join("\n");

  const styleSection = composeVerbPrompt({ prompts, room, store });

  return `<role>
You are the game engine for a text adventure. The player has attempted an action that has no built-in handler. You must decide whether this action should work for this type of object.

Your response creates a REUSABLE handler — it should make sense regardless of which room the player is in. Think about the object's nature (its tags, properties, description), not the current situation.
</role>

${styleSection}

<decision-format>
You must choose one of:

- "perform" — the action makes physical/logical sense for this kind of object.
- "refuse" — you understand the intent, but this shouldn't work for this object. Give a specific, in-character reason in "message".
</decision-format>

<refuse-handlers>
Set message to a specific, in-character explanation of why it fails based on the object's nature. Never use generic refusals like "You can't do that."

Example: "The lantern is made of solid brass — you can't break it with your bare hands."
</refuse-handlers>

<perform-handlers>
For perform, you can respond in two ways:

Simple (no code): static message + events — use "message" for the output text and "events" for property changes. Good for actions with a fixed outcome.

With code: JavaScript function body — use "code" for handlers that need conditional logic (checking properties, different outcomes based on state).

The code has access to these variables:

- object — the target entity: { id, tags (Set), properties (object) }
- indirect — the second entity for "verb X prep Y" commands (e.g. "use wrench on panel" → object=wrench, indirect=panel). Null for transitive/prepositional commands.
- player — the player entity (same shape)
- room — the current room entity
- store — the entity store
- command — the parsed command (command.form, command.verb, command.prep)
- lib — helper library:
${libLines}

Entity shape: { id: string, tags: Set<string>, properties: { [name]: value } }

The code MUST return: { output: string, events: WorldEvent[] }
</perform-handlers>

<tags>
Tags categorize entities and are used to write generic handlers. For example, a "light candle" handler should not check for a specific tinderbox — it should check if the player is carrying anything with the "flame-source" tag. This way any flame source (tinderbox, matches, lit torch) will work.

Use lib.carried() to check what the player is carrying, then filter by tag. The "Tags in World" section lists all tags currently in use.
</tags>

<code-examples>
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

Use one object on another (ditransitive — object + indirect):
\`\`\`
if (!indirect) {
  return lib.result("Use it on what?");
}
if (!indirect.tags.has("device") || indirect.properties.powered) {
  return lib.result("That doesn't seem to help.");
}
return {
  output: "You connect the " + lib.ref(object) + " to the " + lib.ref(indirect) + ". It hums to life.",
  events: [lib.setEvent(indirect.id, { property: "powered", value: true, description: "Powered on" })]
};
\`\`\`

Strip copper wire from an object (creates a new item for the player):
\`\`\`
if (object.properties.description.includes("stripped")) {
  return lib.result("There is nothing left to strip.");
}
return {
  output: "You strip the copper wire from the " + lib.ref(object) + ".",
  events: [
    lib.setEvent(object.id, { property: "description", value: "The device has been stripped of its copper wiring.", description: "Stripped" }),
    lib.createEvent("item:copper-wire", { tags: ["portable"], properties: { name: "Copper Wire", description: "A tangle of salvaged copper wire.", location: player.id }, description: "Created copper wire" })
  ]
};
\`\`\`
</code-examples>

<events>
Property changes: { type: "set-property", entityId, property, value, description }. Property names MUST come from the Available Properties list.
Entity creation: lib.createEvent(entityId, { tags, properties, description }). Use "category:slug" format for IDs (e.g. "item:copper-wire"). Set location to player.id to give it to the player, or room.id to place it in the room.
</events>

<guidelines>
- Only "perform" if physically plausible given the object's tags and properties.
- Do not destroy important game objects without very good reason.
- A "perform" with no events is fine — flavor text is good.
- Prefer code over static message+events when the handler should react to object state.
- When the player combines two objects (ditransitive commands like "use X on Y", "put X in Y", "attach X to Y"), favor outcomes that change the world — unlocking, powering, transforming, or revealing something. These combinations are often the most interesting moments in the game.
- For ditransitive handlers, use "indirect" to reference the second object. Check both objects' tags and properties to decide if the combination makes sense.
- When an action reveals or discovers something (a hidden compartment, a feature, a component), CREATE it as an entity using lib.createEvent so the player can interact with it. Don't just describe it in text — if the player can see it, they should be able to touch it.
</guidelines>`;
}

// --- User prompt building ---

const HIDDEN_PROPERTIES = new Set(["description", "shortDescription", "secret", "aiPrompt"]);

function describeEntityForLlm(entity: Entity): string {
  const tags = Array.from(entity.tags).join(", ");
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity.properties)) {
    if (HIDDEN_PROPERTIES.has(key)) continue;
    props[key] = value;
  }
  return `- id: ${entity.id}\n  tags: [${tags}]\n  properties: ${JSON.stringify(props)}`;
}

export function describeCommand(command: ResolvedCommand): string {
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

export function buildFallbackPrompt(
  store: EntityStore,
  {
    command,
    room,
    alternateVerbs,
    aiInstructions,
  }: {
    command: ResolvedCommand;
    room: Entity;
    alternateVerbs?: Array<{ verb: string; handler: string }>;
    aiInstructions?: string;
  },
): string {
  const parts: string[] = [];

  parts.push(`<user-action>\nThe player typed: "${describeCommand(command)}"\n</user-action>`);

  if (alternateVerbs && alternateVerbs.length > 0) {
    const verbList = alternateVerbs.map((v) => `- "${v.verb}" (${v.handler})`).join("\n");
    parts.push(
      `<existing-verbs>\nThese existing verbs match the same object(s). If the player's verb is a synonym for one of these, use decision "alias" instead of creating a new handler.\n\n${verbList}\n</existing-verbs>`,
    );
  }

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

  const secrets: string[] = [];
  const roomSecret = room.properties["secret"] as string | undefined;
  if (roomSecret) secrets.push(`Room: ${roomSecret}`);
  for (const e of involved) {
    const s = e.properties["secret"] as string | undefined;
    if (s) secrets.push(`${e.properties["name"] || e.id}: ${s}`);
  }
  if (secrets.length > 0) {
    parts.push(
      `<secret>\nHidden information the player doesn't know. Be aware of this when resolving the action, but don't reveal it directly. If the player's action naturally engages with a secret, let it emerge — reward their intuition.\n\n${secrets.join("\n")}\n</secret>`,
    );
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
