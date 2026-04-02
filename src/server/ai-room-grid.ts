import type { EntityStore, Entity, CreateEntityOptions } from "../core/entity.js";
import { reverseDirection } from "./ai-prompt-helpers.js";
import { getStorage } from "./storage-instance.js";
import type { AuthoringInfo, AiEntityRecord } from "./storage.js";

export function uniqueId(store: EntityStore, baseId: string): string {
  if (!store.has(baseId)) return baseId;
  let n = 2;
  while (store.has(`${baseId}-${n}`)) n += 1;
  return `${baseId}-${n}`;
}

function entityToRecord(
  entity: Entity,
  { gameId, authoring }: { gameId: string; authoring: AuthoringInfo },
): AiEntityRecord {
  return {
    createdAt: new Date().toISOString(),
    gameId,
    id: entity.id,
    tags: [...entity.tags],
    name: entity.name,
    description: entity.description,
    location: entity.location,
    aliases: entity.aliases.length > 0 ? [...entity.aliases] : undefined,
    secret: entity.secret,
    exit: entity.exit ? { ...entity.exit } : undefined,
    scenery: entity.scenery.length > 0 ? [...entity.scenery] : undefined,
    room: entity.room
      ? {
          darkWhenUnlit: entity.room.darkWhenUnlit,
          visits: entity.room.visits,
          grid: entity.room.grid ? { ...entity.room.grid } : undefined,
        }
      : undefined,
    ai: entity.ai ? { ...entity.ai } : undefined,
    properties: Object.keys(entity.properties).length > 0 ? { ...entity.properties } : undefined,
    authoring,
  };
}

export async function createAndSave(
  store: EntityStore,
  opts: CreateEntityOptions & {
    id: string;
    gameId: string;
    authoring: AuthoringInfo;
  },
): Promise<void> {
  const entity = store.create(opts.id, opts);
  await getStorage().saveAiEntity(entityToRecord(entity, opts));
}

/** Persist an existing entity's current state to storage. */
export async function persistEntity(
  store: EntityStore,
  { entity, gameId, authoring }: { entity: Entity; gameId: string; authoring: AuthoringInfo },
): Promise<void> {
  await getStorage().saveAiEntity(entityToRecord(entity, { gameId, authoring }));
}

/** Ensure a room has grid coordinates; bootstraps to (0,0,0) if missing. */
export async function ensureGridCoords(
  store: EntityStore,
  { room, gameId, authoring }: { room: Entity; gameId: string; authoring: AuthoringInfo },
): Promise<void> {
  if (room.room && room.room.grid) return;
  if (!room.room) {
    room.room = { darkWhenUnlit: false, visits: 0, grid: { x: 0, y: 0, z: 0 } };
  } else {
    room.room.grid = { x: 0, y: 0, z: 0 };
  }
  await getStorage().saveAiEntity(entityToRecord(room, { gameId, authoring }));
}

/** Create a back-passage on the target room, or resolve an existing unresolved exit. */
export async function resolveOrCreateBackExit(
  store: EntityStore,
  {
    targetRoomId,
    newRoomId,
    direction,
    exitName,
    exitDescription,
    gameId,
    authoring,
  }: {
    targetRoomId: string;
    newRoomId: string;
    direction: string;
    exitName?: string;
    exitDescription?: string;
    gameId: string;
    authoring: AuthoringInfo;
  },
): Promise<void> {
  const backDir = reverseDirection(direction);
  const targetExits = store.getContents(targetRoomId).filter((e) => e.tags.includes("exit"));
  const existing = targetExits.find((e) => {
    if (!e.exit) return false;
    return e.exit.direction.toLowerCase() === backDir && e.exit.destinationIntent;
  });
  if (existing) {
    if (!existing.exit) return;
    existing.exit.destination = newRoomId;
    existing.exit.destinationIntent = undefined;
    if (exitName) existing.name = exitName;
    if (exitDescription) existing.description = exitDescription;
    await getStorage().saveAiEntity(entityToRecord(existing, { gameId, authoring }));
  } else {
    const targetSlug = targetRoomId.replace("room:", "");
    const newRoom = store.get(newRoomId);
    await createAndSave(store, {
      id: `exit:${targetSlug}:${backDir}`,
      tags: ["exit"],
      name: exitName || `Exit ${backDir}`,
      description: exitDescription || `Leads to ${newRoom.name}.`,
      location: targetRoomId,
      exit: {
        direction: backDir,
        destination: newRoomId,
      },
      gameId,
      authoring,
    });
  }
}
