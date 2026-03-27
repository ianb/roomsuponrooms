import { generateObject } from "ai";
import { z } from "zod";
import type { EntityStore, Entity } from "../core/entity.js";
import type { GamePrompts } from "../core/game-data.js";
import type { WorldEvent } from "../core/verb-types.js";
import { getLlm, getLlmProviderOptions } from "./llm.js";
import {
  describeProperties,
  collectTags,
  filterKnownProperties,
  buildPropertiesSchema,
  reverseDirection,
} from "./ai-prompt-helpers.js";
import { composeCreatePrompt } from "./ai-prompts.js";
import { saveAiEntity } from "./ai-entity-store.js";

export interface AiCreateRoomDebugInfo {
  systemPrompt: string;
  prompt: string;
  response: unknown;
  schema?: unknown;
  durationMs: number;
}

export interface AiCreateRoomResult {
  output: string;
  notes?: string;
  roomId: string;
  events: WorldEvent[];
  debug?: AiCreateRoomDebugInfo;
}

const ROOM_EXCLUDED = [
  "name",
  "description",
  "location",
  "aliases",
  "direction",
  "destination",
  "destinationIntent",
];

function buildRoomSchema(store: EntityStore) {
  const propsSchema = buildPropertiesSchema(store, { exclude: ROOM_EXCLUDED });
  return z.object({
    room: z.object({
      idSlug: z.string().describe("Short kebab-case slug for the room ID."),
      name: z.string().describe("Display name for the room."),
      description: z.string().describe("Full room description. 2-4 sentences."),
      tags: z.array(z.string()).describe("Tags for the room. Always include 'room'."),
      properties: propsSchema,
      exitUpdate: z
        .object({
          name: z.string().optional().describe("New name for the exit, if it should change."),
          description: z
            .string()
            .optional()
            .describe("New description for the exit, if it should change."),
        })
        .optional()
        .describe("Optional changes to the exit the player came through."),
      additionalExits: z
        .array(
          z.object({
            direction: z.string(),
            name: z.string(),
            description: z.string(),
            destinationIntent: z
              .string()
              .describe("What this exit should lead to when materialized."),
            aliases: z.array(z.string()),
            properties: propsSchema,
          }),
        )
        .describe("Additional unresolved exits (not the return exit). 0-2 exits."),
      contents: z
        .array(
          z.object({
            idSlug: z.string(),
            idCategory: z.string(),
            name: z.string(),
            description: z.string(),
            tags: z.array(z.string()),
            aliases: z.array(z.string()),
            properties: propsSchema,
          }),
        )
        .describe("Objects/NPCs in the new room. Keep sparse, 0-2 items."),
    }),
    notes: z
      .string()
      .describe("Your reasoning about this room. Shown to the game designer, not the player."),
  });
}

function describeExitForLlm(entity: Entity): string {
  const dir = (entity.properties["direction"] as string) || "?";
  const dest = (entity.properties["destination"] as string) || "(unresolved)";
  const name = (entity.properties["name"] as string) || entity.id;
  return `- ${dir}: ${name} \u2192 ${dest}`;
}

function buildPrompt(
  store: EntityStore,
  { exit, sourceRoom }: { exit: Entity; sourceRoom: Entity },
): string {
  const parts: string[] = [];
  const intent = (exit.properties["destinationIntent"] as string) || "unknown destination";
  const direction = (exit.properties["direction"] as string) || "unknown";
  const exitName = (exit.properties["name"] as string) || exit.id;
  parts.push(
    `<exit-context>\nThe player is going ${direction} through "${exitName}".\nDestination intent: ${intent}\nReturn direction: ${reverseDirection(direction)}\nSource room: ${sourceRoom.properties["name"] || sourceRoom.id}\n</exit-context>`,
  );
  parts.push(
    `<source-room>\n- ${sourceRoom.properties["name"] || sourceRoom.id}: ${sourceRoom.properties["description"] || "No description."}\n</source-room>`,
  );
  const sourceExits = store.getContents(sourceRoom.id).filter((e) => e.tags.has("exit"));
  if (sourceExits.length > 0) {
    parts.push(
      `<source-room-exits>\n${sourceExits.map(describeExitForLlm).join("\n")}\n</source-room-exits>`,
    );
  }
  parts.push(`<available-properties>\n${describeProperties(store)}\n</available-properties>`);
  parts.push(`<existing-tags>\n${collectTags(store).join(", ")}\n</existing-tags>`);
  return parts.join("\n\n");
}

function buildSystemPrompt(ctx: {
  prompts?: GamePrompts;
  room: Entity;
  store: EntityStore;
}): string {
  const styleSection = composeCreatePrompt(ctx);
  return `<role>
You are creating a new room for a text adventure game. The player has walked through an exit that leads to an unmaterialized destination. You must create the room, its contents, and any additional exits.
</role>

${styleSection}

<guidelines>
- The room must match the exit's destinationIntent \u2014 that's the primary constraint.
- Write the room description as what the player sees when entering. 2-4 sentences, vivid but concise.
- A return exit to the source room is created automatically \u2014 do NOT include it in additionalExits.
- Add 0-2 additional unresolved exits to keep the world expandable. Each needs a destinationIntent.
- Add 0-2 contents (objects, NPCs, furniture) only if they make the room interesting or are implied by the intent.
- You may optionally update the exit the player came through (exitUpdate) if, now that the destination is known, the exit name or description should change.
- Rooms are lit by default \u2014 do NOT set "dark" unless the room is specifically meant to be pitch black and inaccessible without a light source. "dark" is a rare exception, not a default for dim or shadowy spaces.
- Set aiPrompt on the room if there's useful context for future AI operations in this room.
- Room contents should use existing tags and properties from the available lists.
</guidelines>`;
}

function uniqueId(store: EntityStore, baseId: string): string {
  if (!store.has(baseId)) return baseId;
  let n = 2;
  while (store.has(`${baseId}-${n}`)) n += 1;
  return `${baseId}-${n}`;
}

function createAndSave(
  store: EntityStore,
  {
    id,
    tags,
    properties,
    gameId,
  }: { id: string; tags: string[]; properties: Record<string, unknown>; gameId: string },
): void {
  store.create(id, { tags, properties });
  saveAiEntity({ createdAt: new Date().toISOString(), gameId, id, tags, properties });
}

export async function handleAiCreateRoom(
  store: EntityStore,
  {
    exit,
    sourceRoom,
    gameId,
    prompts,
    debug,
  }: {
    exit: Entity;
    sourceRoom: Entity;
    gameId: string;
    prompts?: GamePrompts;
    debug?: boolean;
  },
): Promise<AiCreateRoomResult> {
  const systemPrompt = buildSystemPrompt({ prompts, room: sourceRoom, store });
  const prompt = buildPrompt(store, { exit, sourceRoom });
  const direction = (exit.properties["direction"] as string) || "unknown";
  console.log("[ai-create-room] Materializing room via:", direction);
  const startTime = Date.now();
  const objectSchema = buildRoomSchema(store);
  const result = await generateObject({
    model: getLlm(),
    schema: objectSchema,
    system: systemPrompt,
    prompt,
    providerOptions: getLlmProviderOptions(),
  });
  const durationMs = Date.now() - startTime;
  const response = result.object;
  const roomData = response.room;
  console.log(`[ai-create-room] Created: ${roomData.name} (${durationMs}ms)`);

  const roomId = uniqueId(store, `room:${roomData.idSlug}`);
  const roomProps = filterKnownProperties(store, {
    name: roomData.name,
    description: roomData.description,
    ...roomData.properties,
  });
  createAndSave(store, { id: roomId, tags: roomData.tags, properties: roomProps, gameId });

  const events: WorldEvent[] = [];
  function setAndRecord(evt: {
    entityId: string;
    property: string;
    value: unknown;
    description: string;
  }): void {
    store.setProperty(evt.entityId, { name: evt.property, value: evt.value });
    events.push({ type: "set-property", ...evt });
  }
  setAndRecord({
    entityId: exit.id,
    property: "destination",
    value: roomId,
    description: "Resolved exit",
  });
  setAndRecord({
    entityId: exit.id,
    property: "destinationIntent",
    value: undefined,
    description: "Cleared intent",
  });
  if (roomData.exitUpdate) {
    if (roomData.exitUpdate.name) {
      setAndRecord({
        entityId: exit.id,
        property: "name",
        value: roomData.exitUpdate.name,
        description: "Updated exit name",
      });
    }
    if (roomData.exitUpdate.description) {
      setAndRecord({
        entityId: exit.id,
        property: "description",
        value: roomData.exitUpdate.description,
        description: "Updated exit desc",
      });
    }
  }

  // Persist the modified exit so changes survive /reset
  saveAiEntity({
    createdAt: new Date().toISOString(),
    gameId,
    id: exit.id,
    tags: Array.from(exit.tags),
    properties: { ...exit.properties },
  });

  // Return exit
  const roomSlug = roomId.replace("room:", "");
  const returnDir = reverseDirection(direction);
  createAndSave(store, {
    id: `exit:${roomSlug}:${returnDir}`,
    tags: ["exit"],
    properties: {
      location: roomId,
      direction: returnDir,
      destination: sourceRoom.id,
      name: `Exit ${returnDir}`,
      description: `Leads back to ${sourceRoom.properties["name"] || sourceRoom.id}.`,
    },
    gameId,
  });

  // Additional exits
  for (const ed of roomData.additionalExits) {
    const eid = `exit:${roomSlug}:${ed.direction.toLowerCase().replace(/\s+/g, "-")}`;
    if (store.has(eid)) continue;
    const ep = filterKnownProperties(store, {
      location: roomId,
      direction: ed.direction,
      name: ed.name,
      description: ed.description,
      destinationIntent: ed.destinationIntent,
      ...ed.properties,
    });
    if (ed.aliases.length > 0) ep.aliases = ed.aliases;
    createAndSave(store, { id: eid, tags: ["exit"], properties: ep, gameId });
  }

  for (const item of roomData.contents) {
    const iid = uniqueId(store, `${item.idCategory}:${item.idSlug}`);
    const ip = filterKnownProperties(store, {
      location: roomId,
      name: item.name,
      description: item.description,
      ...item.properties,
    });
    if (item.aliases.length > 0) ip.aliases = item.aliases;
    createAndSave(store, { id: iid, tags: item.tags, properties: ip, gameId });
  }

  const debugInfo: AiCreateRoomDebugInfo | undefined = debug
    ? { systemPrompt, prompt, response, schema: z.toJSONSchema(objectSchema), durationMs }
    : undefined;
  return {
    output: roomData.description,
    notes: response.notes || undefined,
    roomId,
    events,
    debug: debugInfo,
  };
}
