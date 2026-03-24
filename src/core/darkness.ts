import type { EntityStore, Entity } from "./entity.js";

/** Check if a room is currently lit (either inherently lit or has a light source present) */
export function isRoomLit(
  store: EntityStore,
  { room, playerId }: { room: Entity; playerId: string },
): boolean {
  // Room itself is lit (aboveground or has its own light)
  if (room.properties["lit"] === true) return true;

  // Room is not dark by default
  if (room.properties["dark"] !== true) return true;

  // Check if player or room contains a lit item
  if (hasLightSource(store, playerId)) return true;
  if (hasLightSource(store, room.id)) return true;

  return false;
}

/** Check if an entity or any of its contents (recursively) provide light */
function hasLightSource(store: EntityStore, entityId: string): boolean {
  const contents = store.getContentsDeep(entityId);
  for (const item of contents) {
    if (item.properties["lit"] === true) return true;
  }
  return false;
}

/** Get the darkness description */
export function darknessDescription(): string {
  return "It is pitch dark. You are likely to be eaten by a grue.";
}
