import type { PropertyRegistry } from "./properties.js";
import { defineProperty } from "./properties.js";

/**
 * Base property definitions for the extensible property bag.
 *
 * Properties that have moved to typed Entity fields are NOT here:
 * name, description, location, aliases, secret → Entity top-level
 * direction, destination, destinationIntent → Entity.exit
 * darkWhenUnlit (was dark), visits, scenery, gridX/Y/Z → Entity.room
 * aiPrompt, aiConversationPrompt → Entity.ai
 */
const BASE_PROPS = [
  {
    name: "shortDescription",
    description: "Template string used in listings (inventory, room items). Falls back to name.",
    schema: { type: "string" },
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
    description: "Whether this item provides light",
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
    name: "gateTrack",
    description:
      "Progression gate: name of the meter (track) that must reach gateAtLeast before this exit/entity is reachable",
    schema: { type: "string" },
  },
  {
    name: "gateAtLeast",
    description: "Progression gate: meter value required to pass gateTrack",
    schema: { type: "number" },
    defaultValue: 0,
  },
  {
    name: "gateHidden",
    description:
      "Progression gate: when true, hide this exit/entity entirely until the gate is met (no signpost)",
    schema: { type: "boolean" },
    defaultValue: false,
  },
  {
    name: "gateMessage",
    description:
      "Progression gate: in-character signpost shown when a visible gate blocks the player",
    schema: { type: "string" },
  },
  {
    name: "powerRemaining",
    description: "Remaining power/fuel for a device",
    schema: { type: "number" },
    defaultValue: 0,
  },
] as const;

/** Define the standard set of properties used by the engine */
export function defineBaseProperties(registry: PropertyRegistry): void {
  for (const prop of BASE_PROPS) {
    defineProperty(registry, prop);
  }
}
