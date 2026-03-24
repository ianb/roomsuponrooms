import type { EntityStore, Entity } from "./entity.js";
import { renderTemplate } from "./templates.js";

function entityName(entity: Entity): string {
  return (entity.properties["name"] as string) || entity.id;
}

/** Mark an entity name for highlighting in output: {{id|Name}} */
export function entityRef(entity: Entity): string {
  return `{{${entity.id}|${entityName(entity)}}}`;
}

export function describeRoomFull(
  store: EntityStore,
  { room, playerId }: { room: Entity; playerId: string },
): string {
  const name = entityRef(room);
  const rawDescription = (room.properties["description"] as string) || "";
  const description = renderTemplate(rawDescription, { entity: room, store });
  const contents = store.getContents(room.id);

  const exits = contents.filter((e) => e.tags.has("exit"));
  const exitDirs = exits.map((e) => (e.properties["direction"] as string) || "?");
  const exitList = exitDirs.length > 0 ? exitDirs.join(", ") : "none";

  const items = contents.filter((e) => !e.tags.has("exit") && e.id !== playerId);
  const parts = [`${name}\n\n${description}`];

  if (items.length > 0) {
    const itemDescs = items.map((e) => {
      const ref = entityRef(e);
      if (e.tags.has("container") && e.tags.has("openable")) {
        return e.properties["open"] === true ? `${ref} (open)` : `${ref} (closed)`;
      }
      return ref;
    });
    parts.push(`\nYou see: ${itemDescs.join(", ")}.`);
  }

  parts.push(`\nExits: ${exitList}`);
  return parts.join("");
}
