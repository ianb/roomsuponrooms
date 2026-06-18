import type { EntityStore, Entity } from "./entity.js";
import { renderTemplate } from "./templates.js";
import { gateState } from "./progression.js";

/** A hidden, unmet progression gate removes an entity from player-facing listings. */
function hiddenByGate(entity: Entity, player: Entity | null): boolean {
  if (!player) return false;
  const gate = gateState(entity, player);
  return gate.gated && !gate.passes && gate.hidden;
}

/** Mark an entity name for highlighting in output: {{id|Name}} */
export function entityRef(entity: Entity): string {
  return `{{${entity.id}|${entity.name}}}`;
}

/**
 * Display string for an item in listings (inventory, room "You see:").
 * Uses shortDescription template if set, otherwise falls back to entityRef.
 */
export function itemDisplay(entity: Entity, store: EntityStore): string {
  const short = entity.properties.shortDescription;
  if (short) {
    const rendered = renderTemplate(short, { entity, store });
    return `{{${entity.id}|${rendered}}}`;
  }
  return entityRef(entity);
}

export function describeRoomFull(
  store: EntityStore,
  { room, playerId }: { room: Entity; playerId: string },
): string {
  const name = entityRef(room);
  const description = renderTemplate(room.description, { entity: room, store });
  const player = store.has(playerId) ? store.get(playerId) : null;
  const contents = store.getContents(room.id).filter((e) => !hiddenByGate(e, player));

  const dirOrder: Record<string, number> = {
    north: 0,
    south: 1,
    east: 2,
    west: 3,
    northeast: 4,
    northwest: 5,
    southeast: 6,
    southwest: 7,
    up: 8,
    down: 9,
  };
  const exits = contents.filter((e) => e.tags.includes("exit"));
  exits.sort((a, b) => {
    const da = (a.exit && a.exit.direction) || "";
    const db = (b.exit && b.exit.direction) || "";
    return (dirOrder[da] ?? 99) - (dirOrder[db] ?? 99);
  });
  const exitDescs = exits.map((e) => {
    const dir = (e.exit && e.exit.direction) || "?";
    const short = e.properties.shortDescription;
    if (short) {
      const rendered = renderTemplate(short, { entity: e, store });
      return `<<${dir}>> (${rendered})`;
    }
    if (e.name && e.name !== e.id) {
      return `<<${dir}>> (${e.name})`;
    }
    return `<<${dir}>>`;
  });
  const exitList = exitDescs.length > 0 ? exitDescs.join(", ") : "none";

  const nonExits = contents.filter((e) => !e.tags.includes("exit") && e.id !== playerId);
  const npcs = nonExits.filter((e) => e.tags.includes("npc"));
  const items = nonExits.filter((e) => !e.tags.includes("npc"));
  const parts = [`${name}\n{img:${room.id}|${room.name}}\n${description}`];

  if (npcs.length > 0) {
    const npcDescs = npcs.map((e) => itemDisplay(e, store));
    const npcImages = npcs.map((e) => `{img:${e.id}|${e.name}}`).join("");
    const npcText =
      npcs.length === 1 ? `${npcDescs[0]!} is here.` : `${npcDescs.join(", ")} are here.`;
    parts.push(`\n${npcImages}\n${npcText}`);
  }

  if (items.length > 0) {
    const itemDescs = items.map((e) => {
      const display = itemDisplay(e, store);
      if (e.tags.includes("container") && e.tags.includes("openable")) {
        return e.properties.open ? `${display} (open)` : `${display} (closed)`;
      }
      return display;
    });
    parts.push(`\nYou see: ${itemDescs.join(", ")}.`);
  }

  parts.push(`\nExits: ${exitList}`);
  return parts.join("");
}
