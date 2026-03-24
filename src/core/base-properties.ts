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
    { name: "location", description: "ID of the containing entity", schema: { type: "string" } },
    { name: "direction", description: "Direction label for an exit", schema: { type: "string" } },
    { name: "destination", description: "Target room ID for an exit", schema: { type: "string" } },
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
      schema: { type: "string" },
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
      description: "Whether this room is dark (requires a light source to see)",
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
  ] as const;

  for (const prop of props) {
    defineProperty(registry, prop);
  }
}
