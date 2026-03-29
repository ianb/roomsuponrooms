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
  reverseDirection,
} from "./ai-prompt-helpers.js";
import { composeCreatePrompt } from "./ai-prompts.js";
import { buildRoomSchema } from "./ai-create-room-schema.js";
import { getStorage } from "./storage-instance.js";
import type { AuthoringInfo } from "./storage.js";

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
You are creating a new room for a text adventure. The player walked through an exit to an unmaterialized destination. Create the room, contents, and any additional exits.
</role>

${styleSection}

<guidelines>
- The room must match the exit's destinationIntent — that's the primary constraint.
- Room description: what the player sees when entering. 2-4 sentences, vivid but concise.
- A return exit is created automatically — do NOT include it in additionalExits.
- Add 0-2 additional unresolved exits (each needs a destinationIntent) and 0-2 contents.
- You may update the entry exit (exitUpdate) if, now that the destination is known, its name/description should change.
- Rooms are lit by default — only set "dark" for pitch-black rooms requiring a light source.
- Set aiPrompt if there's useful context for future AI operations in this room.
- Room contents should use existing tags and properties from the available lists.
</guidelines>`;
}

function uniqueId(store: EntityStore, baseId: string): string {
  if (!store.has(baseId)) return baseId;
  let n = 2;
  while (store.has(`${baseId}-${n}`)) n += 1;
  return `${baseId}-${n}`;
}

async function createAndSave(
  store: EntityStore,
  opts: {
    id: string;
    tags: string[];
    properties: Record<string, unknown>;
    gameId: string;
    authoring?: AuthoringInfo;
  },
): Promise<void> {
  store.create(opts.id, { tags: opts.tags, properties: opts.properties });
  await getStorage().saveAiEntity({ createdAt: new Date().toISOString(), ...opts });
}

export async function handleAiCreateRoom(
  store: EntityStore,
  {
    exit,
    sourceRoom,
    gameId,
    prompts,
    debug,
    authoring,
  }: {
    exit: Entity;
    sourceRoom: Entity;
    gameId: string;
    prompts?: GamePrompts;
    debug?: boolean;
    authoring?: AuthoringInfo;
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
    ...(roomData.secret ? { secret: roomData.secret } : {}),
  });
  await createAndSave(store, {
    id: roomId,
    tags: roomData.tags,
    properties: roomProps,
    gameId,
    authoring,
  });

  const events: WorldEvent[] = [];
  function setExit({
    property,
    value,
    description,
  }: {
    property: string;
    value: unknown;
    description: string;
  }): void {
    store.setProperty(exit.id, { name: property, value });
    events.push({ type: "set-property", entityId: exit.id, property, value, description });
  }
  setExit({ property: "destination", value: roomId, description: "Resolved exit" });
  setExit({ property: "destinationIntent", value: undefined, description: "Cleared intent" });
  if (roomData.exitUpdate) {
    if (roomData.exitUpdate.name)
      setExit({
        property: "name",
        value: roomData.exitUpdate.name,
        description: "Updated exit name",
      });
    if (roomData.exitUpdate.description)
      setExit({
        property: "description",
        value: roomData.exitUpdate.description,
        description: "Updated exit desc",
      });
  }

  // Persist the modified exit so changes survive /reset
  await getStorage().saveAiEntity({
    createdAt: new Date().toISOString(),
    gameId,
    id: exit.id,
    tags: Array.from(exit.tags),
    properties: { ...exit.properties },
    authoring,
  });

  // Return exit
  const roomSlug = roomId.replace("room:", "");
  const returnDir = reverseDirection(direction);
  await createAndSave(store, {
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
    authoring,
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
    await createAndSave(store, { id: eid, tags: ["exit"], properties: ep, gameId, authoring });
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
    await createAndSave(store, { id: iid, tags: item.tags, properties: ip, gameId, authoring });
  }

  return {
    output: roomData.description,
    notes: response.notes || undefined,
    roomId,
    events,
    debug: debug
      ? { systemPrompt, prompt, response, schema: z.toJSONSchema(objectSchema), durationMs }
      : undefined,
  };
}
