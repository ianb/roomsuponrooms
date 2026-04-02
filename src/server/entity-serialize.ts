import type { AiEntityRecord } from "./storage.js";
import type { EntityRow } from "./d1-types.js";
import { rowToAuthoring } from "./d1-types.js";

/**
 * The D1 `properties` column stores a flat JSON blob with ALL entity data.
 * These helpers convert between the flat DB format and the structured EntityData shape.
 */

/** Keys that map to typed Entity fields — excluded from the properties bag */
const STRUCTURED_KEYS = new Set([
  "name",
  "description",
  "location",
  "aliases",
  "secret",
  "scenery",
  "exit",
  "room",
  "ai",
  // Legacy flat keys (pre-restructuring data in D1)
  "direction",
  "destination",
  "destinationIntent",
  "aiPrompt",
  "aiConversationPrompt",
  "dark",
  "visits",
  "gridX",
  "gridY",
  "gridZ",
]);

export function deserializeEntityRow(row: EntityRow): AiEntityRecord {
  const flat = JSON.parse(row.properties) as Record<string, unknown>;
  const record: AiEntityRecord = {
    id: row.id,
    tags: JSON.parse(row.tags) as string[],
    name: (flat["name"] as string) || row.id,
    description: (flat["description"] as string) || "",
    location: (flat["location"] as string) || "world",
    createdAt: row.created_at,
    gameId: row.game_id,
    authoring: rowToAuthoring(row),
  };
  if (flat["aliases"]) record.aliases = flat["aliases"] as string[];
  if (flat["secret"]) record.secret = flat["secret"] as string;
  if (flat["scenery"]) record.scenery = flat["scenery"] as AiEntityRecord["scenery"];
  // Exit facet: new format or legacy flat keys
  if (flat["exit"]) {
    record.exit = flat["exit"] as AiEntityRecord["exit"];
  } else if (flat["direction"]) {
    record.exit = {
      direction: flat["direction"] as string,
      destination: flat["destination"] as string | undefined,
      destinationIntent: flat["destinationIntent"] as string | undefined,
    };
  }
  // Room facet: new format or legacy flat keys
  if (flat["room"]) {
    record.room = flat["room"] as AiEntityRecord["room"];
  } else if (flat["dark"] || flat["visits"] || flat["gridX"]) {
    record.room = { darkWhenUnlit: flat["dark"] === true };
  }
  // AI facet: new format or legacy flat keys
  if (flat["ai"]) {
    record.ai = flat["ai"] as AiEntityRecord["ai"];
  } else if (flat["aiPrompt"] || flat["aiConversationPrompt"]) {
    record.ai = {
      prompt: flat["aiPrompt"] as string | undefined,
      conversationPrompt: flat["aiConversationPrompt"] as string | undefined,
    };
  }
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) {
    if (!STRUCTURED_KEYS.has(k)) props[k] = v;
  }
  if (Object.keys(props).length > 0) record.properties = props;
  return record;
}

export function serializeEntityRecord(record: AiEntityRecord): string {
  const flat: Record<string, unknown> = {
    name: record.name,
    description: record.description,
    location: record.location,
  };
  if (record.aliases && record.aliases.length > 0) flat["aliases"] = record.aliases;
  if (record.secret) flat["secret"] = record.secret;
  if (record.scenery && record.scenery.length > 0) flat["scenery"] = record.scenery;
  if (record.exit) flat["exit"] = record.exit;
  if (record.room) flat["room"] = record.room;
  if (record.ai) flat["ai"] = record.ai;
  if (record.properties) {
    for (const [k, v] of Object.entries(record.properties)) {
      if (v !== undefined) flat[k] = v === undefined ? null : v;
    }
  }
  return JSON.stringify(flat);
}
