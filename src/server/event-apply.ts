import type { EntityStore } from "../core/entity.js";
import type { WorldEvent } from "../core/verb-types.js";

/** Apply a list of events to the store */
export function applyEvents(store: EntityStore, events: WorldEvent[]): void {
  for (const event of events) {
    if (event.type === "create-entity") {
      if (!store.has(event.entityId)) {
        const data = event.value as { tags: string[]; properties: Record<string, unknown> };
        store.create(event.entityId, { tags: data.tags, properties: data.properties });
      }
    } else if (event.type === "set-property" && event.property) {
      store.setProperty(event.entityId, { name: event.property, value: event.value });
    } else if (event.type === "remove-property" && event.property) {
      store.removeProperty(event.entityId, event.property);
    }
  }
}
