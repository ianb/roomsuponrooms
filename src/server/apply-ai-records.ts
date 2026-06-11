import type { EntityStore } from "../core/entity.js";
import type { AiEntityRecord } from "./storage.js";

/**
 * Walk a list of AI entity records and apply each to the store. The first
 * record for an entity creates it; subsequent records merge as overlays:
 *
 * - Top-level fields (name, description, exit, room, ai, etc.) overwrite.
 * - `properties` entries with `null` value erase the property; otherwise set it.
 *
 * This is the read-time replay used both by the live game's startup path and
 * by the agent world facade (which feeds it pending session edits on top of
 * the live materialized records).
 */
export function applyAiEntityRecords(records: AiEntityRecord[], store: EntityStore): void {
  for (const record of records) {
    // Player entities are per-user runtime state (rebuilt from the event
    // log), never shared world content. A persisted player record would
    // stamp one user's stale location and scenery onto every world build.
    const existingIsPlayer = store.has(record.id) && store.get(record.id).tags.includes("player");
    if (existingIsPlayer || (record.tags && record.tags.includes("player"))) {
      console.error(`[apply-ai-records] Skipping ${record.id}: player entities are not applied`);
      continue;
    }
    if (store.has(record.id)) {
      const entity = store.get(record.id);
      if (record.name !== undefined) entity.name = record.name;
      if (record.description !== undefined) entity.description = record.description;
      if (record.aliases) entity.aliases = record.aliases;
      if (record.secret !== undefined) entity.secret = record.secret;
      if (record.scenery) entity.scenery = record.scenery;
      if (record.exit) entity.exit = record.exit;
      if (record.room) entity.room = { ...entity.room, ...record.room } as typeof entity.room;
      if (record.ai) entity.ai = record.ai;
      if (record.tags) entity.tags = record.tags;
      if (record.location !== undefined && record.location !== entity.location) {
        store.setLocation(record.id, record.location);
      }
      if (record.properties) {
        for (const [key, value] of Object.entries(record.properties)) {
          if (value === null) {
            store.removeProperty(record.id, key);
          } else {
            store.setProperty(record.id, { name: key, value });
          }
        }
      }
    } else {
      store.create(record.id, {
        tags: record.tags,
        name: record.name,
        description: record.description,
        location: record.location,
        aliases: record.aliases,
        secret: record.secret,
        scenery: record.scenery,
        exit: record.exit,
        room: record.room,
        ai: record.ai,
        properties: record.properties,
      });
    }
  }
}
