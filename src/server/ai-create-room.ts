import { generateObject } from "ai";
import { z } from "zod";
import type { EntityStore, Entity } from "../core/entity.js";
import type { GamePrompts } from "../core/game-data.js";
import type { WorldEvent } from "../core/verb-types.js";
import { getLlm, getLlmProviderOptions, getLlmAbortSignal, getLlmModelId } from "./llm.js";
import { runLoggedAiCall } from "./ai-call-log.js";
import {
  describeProperties,
  collectTags,
  filterKnownProperties,
  reverseDirection,
  buildNearbyContext,
  computeRoomCoordinates,
  buildAdjacentRoomContext,
} from "./ai-prompt-helpers.js";
import { composeCreatePrompt } from "./ai-prompts.js";
import { buildRoomSchema } from "./ai-create-room-schema.js";
import {
  uniqueId,
  createAndSave,
  ensureGridCoords,
  resolveOrCreateBackExit,
  persistEntity,
} from "./ai-room-grid.js";
import type { AuthoringInfo } from "./storage.js";
import { recordAiCall } from "./ai-quota.js";
import { AiGenerationIncompleteError } from "./ai-errors.js";

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
  const dir = (entity.exit && entity.exit.direction) || "?";
  const dest = (entity.exit && entity.exit.destination) || "(unresolved)";
  const name = entity.name;
  return `- ${dir}: ${name} \u2192 ${dest}`;
}

function buildPrompt(
  store: EntityStore,
  { exit, sourceRoom, playerId }: { exit: Entity; sourceRoom: Entity; playerId: string },
): string {
  const parts: string[] = [];
  const intent = (exit.exit && exit.exit.destinationIntent) || "unknown destination";
  const direction = (exit.exit && exit.exit.direction) || "unknown";
  const exitName = exit.name;
  parts.push(
    `<exit-context>\nThe player is going ${direction} through "${exitName}".\nDestination intent: ${intent}\nReturn direction: ${reverseDirection(direction)}\nSource room: ${sourceRoom.name}\n</exit-context>`,
  );
  parts.push(
    `<source-room>\n- ${sourceRoom.name}: ${sourceRoom.description || "No description."}\n</source-room>`,
  );
  const sourceExits = store.getContents(sourceRoom.id).filter((e) => e.tags.includes("exit"));
  if (sourceExits.length > 0) {
    parts.push(
      `<source-room-exits>\n${sourceExits.map(describeExitForLlm).join("\n")}\n</source-room-exits>`,
    );
  }
  const nearby = buildNearbyContext(store, { room: sourceRoom, playerId });
  if (nearby) parts.push(nearby);
  // Adjacent rooms for grid connectivity
  const newCoords = computeRoomCoordinates(sourceRoom, direction);
  if (newCoords) {
    const adjacent = buildAdjacentRoomContext(store, newCoords);
    if (adjacent) parts.push(adjacent);
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
- Room description: what the player sees when entering. 2-4 sentences, vivid but concise. Mention details that suggest actions — things that can be opened, examined, operated, or interacted with.
- A return exit is created automatically — do NOT include it in additionalExits. Set returnExitName and returnExitDescription to give it a fitting name (e.g. "Worn Stone Steps" / "The steps lead back down to the hall.").
- Add 0-2 additional exits and 0-2 contents.
- Each exit needs either destinationIntent (new unresolved exit) or connectTo (link to existing room).
- You may connect an exit to an adjacent room listed in <adjacent-rooms> by setting connectTo to its ID. When connecting, also set backExitName and backExitDescription for the return passage on that room. Only connect when narratively natural (corridors circling back, shortcuts, alternate routes). Don't force connections.
- You may update the entry exit (exitUpdate) if, now that the destination is known, its name/description should change.
- Rooms are lit by default — only set "dark" for pitch-black rooms requiring a light source.
- Set aiPrompt if there's useful context for future AI operations in this room.
- Room contents should use existing tags and properties from the available lists.
</guidelines>`;
}

export async function handleAiCreateRoom(
  store: EntityStore,
  {
    exit,
    sourceRoom,
    gameId,
    playerId,
    prompts,
    debug,
    authoring,
  }: {
    exit: Entity;
    sourceRoom: Entity;
    gameId: string;
    playerId: string;
    prompts?: GamePrompts;
    debug?: boolean;
    authoring: AuthoringInfo;
  },
): Promise<AiCreateRoomResult> {
  const systemPrompt = buildSystemPrompt({ prompts, room: sourceRoom, store });
  const prompt = buildPrompt(store, { exit, sourceRoom, playerId });
  const direction = (exit.exit && exit.exit.direction) || "unknown";
  console.log("[ai-create-room] Materializing room via:", direction);
  const objectSchema = buildRoomSchema(store);
  const startTime = Date.now();
  const { result, callId: aiCallId } = await runLoggedAiCall(
    {
      gameId,
      userId: authoring.createdBy,
      kind: "room",
      context: `unresolved-exit ${direction} from ${sourceRoom.id}`,
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
  await recordAiCall(authoring.createdBy, "room");
  const response = result.object;
  const roomData = response.room;
  if (!roomData.name || !roomData.description) {
    throw new AiGenerationIncompleteError();
  }
  console.log(`[ai-create-room] Created: ${roomData.name} (${durationMs}ms)`);
  // Stamp aiCallId onto authoring so every entity this call creates links
  // back to the logged prompt/response.
  const stamped: AuthoringInfo = { ...authoring, aiCallId };
  const roomId = uniqueId(store, `room:${roomData.idSlug}`);
  const newCoords = computeRoomCoordinates(sourceRoom, direction);
  const roomProps = filterKnownProperties(store, { ...roomData.properties });
  if (newCoords) {
    roomProps.gridX = newCoords.x;
    roomProps.gridY = newCoords.y;
    roomProps.gridZ = newCoords.z;
  }
  await createAndSave(store, {
    id: roomId,
    tags: roomData.tags,
    name: roomData.name,
    description: roomData.description,
    secret: roomData.secret,
    properties: roomProps,
    ai: roomData.imagePrompt ? { imagePrompt: roomData.imagePrompt } : undefined,
    gameId,
    authoring: stamped,
  });
  await ensureGridCoords(store, { room: sourceRoom, gameId, authoring: stamped });

  const events: WorldEvent[] = [];
  const setExit = (opts: { property: string; value: unknown; description: string }): void => {
    store.setProperty(exit.id, { name: opts.property, value: opts.value });
    events.push({ type: "set-property", entityId: exit.id, ...opts });
  };
  setExit({ property: "destination", value: roomId, description: "Resolved exit" });
  setExit({ property: "destinationIntent", value: undefined, description: "Cleared intent" });
  const update = roomData.exitUpdate;
  if (update && update.name) {
    setExit({ property: "name", value: update.name, description: "Updated exit name" });
  }
  if (update && update.description) {
    setExit({
      property: "description",
      value: update.description,
      description: "Updated exit desc",
    });
  }

  await persistEntity(store, { entity: exit, gameId, authoring: stamped });
  const roomSlug = roomId.replace("room:", "");
  await createReturnAndAdditionalExits(store, {
    roomSlug,
    roomId,
    sourceRoom,
    direction,
    roomData,
    gameId,
    authoring: stamped,
  });
  for (const item of roomData.contents) {
    const iid = uniqueId(store, `${item.idCategory}:${item.idSlug}`);
    const ip = filterKnownProperties(store, { ...item.properties });
    await createAndSave(store, {
      id: iid,
      tags: item.tags,
      name: item.name,
      description: item.description,
      location: roomId,
      aliases: item.aliases.length > 0 ? item.aliases : undefined,
      properties: ip,
      gameId,
      authoring: stamped,
    });
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

type RoomData = z.infer<ReturnType<typeof buildRoomSchema>>["room"];
interface ExitCreationParams {
  roomSlug: string;
  roomId: string;
  sourceRoom: Entity;
  direction: string;
  roomData: RoomData;
  gameId: string;
  authoring: AuthoringInfo;
}

async function createReturnAndAdditionalExits(
  store: EntityStore,
  { roomSlug, roomId, sourceRoom, direction, roomData, gameId, authoring }: ExitCreationParams,
): Promise<void> {
  const returnDir = reverseDirection(direction);
  const srcName = sourceRoom.name;
  await createAndSave(store, {
    id: `exit:${roomSlug}:${returnDir}`,
    tags: ["exit"],
    name: roomData.returnExitName || `Exit ${returnDir}`,
    description: roomData.returnExitDescription || `Leads back to ${srcName}.`,
    location: roomId,
    exit: { direction: returnDir, destination: sourceRoom.id },
    gameId,
    authoring,
  });
  for (const ed of roomData.additionalExits) {
    const eid = `exit:${roomSlug}:${ed.direction.toLowerCase().replace(/\s+/g, "-")}`;
    if (store.has(eid)) continue;
    const isConnected = ed.connectTo && store.has(ed.connectTo);
    const exitData = isConnected
      ? { direction: ed.direction, destination: ed.connectTo as string }
      : { direction: ed.direction, destinationIntent: ed.destinationIntent };
    await createAndSave(store, {
      id: eid,
      tags: ["exit"],
      name: ed.name,
      description: ed.description,
      location: roomId,
      aliases: ed.aliases.length > 0 ? ed.aliases : undefined,
      properties: filterKnownProperties(store, { ...ed.properties }),
      exit: exitData,
      gameId,
      authoring,
    });
    if (isConnected) {
      await resolveOrCreateBackExit(store, {
        targetRoomId: ed.connectTo!,
        newRoomId: roomId,
        direction: ed.direction,
        exitName: ed.backExitName,
        exitDescription: ed.backExitDescription,
        gameId,
        authoring,
      });
    }
  }
}
