import type { PropertyRegistry } from "./properties.js";
import { defineProperty } from "./properties.js";

/** Define the standard set of properties used by the engine */
export function defineBaseProperties(registry: PropertyRegistry): void {
  const props = [
    { name: "name", description: "Display name", schema: { type: "string" } },
    {
      name: "description",
      description: "Text description shown to the player",
      schema: { type: "string" },
    },
    {
      name: "shortDescription",
      description: "Template string used in listings (inventory, room items). Falls back to name.",
      schema: { type: "string" },
    },
    {
      name: "location",
      description: "ID of the containing entity",
      schema: { type: "string", format: "entity-ref" },
    },
    { name: "direction", description: "Direction label for an exit", schema: { type: "string" } },
    {
      name: "destination",
      description: "Target room ID for an exit",
      schema: { type: "string", format: "entity-ref" },
    },
    {
      name: "open",
      description: "Whether a container or door is open",
      schema: { type: "boolean" },
      defaultValue: false,
    },
    {
      name: "locked",
      description: "Whether something is locked",
      schema: { type: "boolean" },
      defaultValue: false,
    },
    {
      name: "unlockedBy",
      description: "Entity ID of the key that unlocks this",
      schema: { type: "string", format: "entity-ref" },
    },
    {
      name: "visits",
      description: "Number of times the player has entered this room",
      schema: { type: "number" },
      defaultValue: 0,
    },
    {
      name: "aliases",
      description: "Alternative names for matching in commands",
      schema: { type: "array", items: { type: "string" } },
    },
    {
      name: "carryingCapacity",
      description: "Maximum number of items the player can carry (0 = unlimited)",
      schema: { type: "number" },
      defaultValue: 0,
    },
    {
      name: "score",
      description: "Player's current score",
      schema: { type: "number" },
      defaultValue: 0,
    },
    {
      name: "maxScore",
      description: "Maximum possible score",
      schema: { type: "number" },
      defaultValue: 0,
    },
    {
      name: "lit",
      description: "Whether this room or item provides light",
      schema: { type: "boolean" },
      defaultValue: false,
    },
    {
      name: "dark",
      description: "Room is pitch black — player sees nothing without a light source",
      schema: { type: "boolean" },
      defaultValue: false,
    },
    {
      name: "switchedOn",
      description: "Whether a device is currently switched on",
      schema: { type: "boolean" },
      defaultValue: false,
    },
    {
      name: "fixed",
      description: "Whether an item is fixed in place and cannot be taken",
      schema: { type: "boolean" },
      defaultValue: false,
    },
    {
      name: "takeRefusal",
      description: "In-character message when player tries to take a fixed object",
      schema: { type: "string" },
    },
    {
      name: "worn",
      description: "Whether a wearable item is currently being worn by the player",
      schema: { type: "boolean" },
      defaultValue: false,
    },
    {
      name: "depositPoints",
      description: "Score points awarded when this treasure is deposited",
      schema: { type: "number" },
      defaultValue: 0,
    },
    {
      name: "pairedDoor",
      description: "Entity ID of the paired door (other side)",
      schema: { type: "string", format: "entity-ref" },
    },
    {
      name: "powerRemaining",
      description: "Remaining power/fuel for a device",
      schema: { type: "number" },
      defaultValue: 0,
    },
    {
      name: "aiPrompt",
      description: "AI guidance prompt for this entity's location (not shown to players)",
      schema: { type: "string" },
    },
    {
      name: "secret",
      description:
        "Hidden interactive potential not obvious from the description — guides AI verb resolution (not shown to players)",
      schema: { type: "string" },
    },
    {
      name: "scenery",
      description: "Scenery descriptions for atmospheric details in a room",
      schema: { type: "array" },
    },
    {
      name: "destinationIntent",
      description:
        "Description of what an unresolved exit should lead to (replaced by destination when materialized)",
      schema: { type: "string" },
    },
  ] as const;

  for (const prop of props) {
    defineProperty(registry, prop);
  }
}
