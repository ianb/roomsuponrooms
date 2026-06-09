import type { EntityStore, CreateEntityOptions } from "./entity.js";
import type { WorldEvent } from "./verb-types.js";

function logSkipped(event: WorldEvent, reason: string): void {
  console.error(
    `[apply-event] Skipping ${event.type} event for ${event.entityId}: ${reason} (${event.description})`,
  );
}

/** Apply a single event to the store, routing typed fields appropriately */
export function applySingleEvent(store: EntityStore, event: WorldEvent): void {
  if (event.type === "create-entity") {
    // Re-creating an existing entity is a no-op so replays stay idempotent.
    if (store.has(event.entityId)) return;
    if (typeof event.value !== "object" || event.value === null) {
      logSkipped(event, `value is not an object (got ${typeof event.value})`);
      return;
    }
    store.create(event.entityId, event.value as CreateEntityOptions);
  } else if (event.type === "set-property") {
    if (!event.property) {
      logSkipped(event, "missing property name");
      return;
    }
    if (!store.has(event.entityId)) {
      logSkipped(event, "entity does not exist");
      return;
    }
    store.setProperty(event.entityId, { name: event.property, value: event.value });
  } else if (event.type === "remove-property") {
    if (!event.property) {
      logSkipped(event, "missing property name");
      return;
    }
    if (!store.has(event.entityId)) {
      logSkipped(event, "entity does not exist");
      return;
    }
    store.removeProperty(event.entityId, event.property);
  } else {
    logSkipped(event, "unknown event type");
  }
}
