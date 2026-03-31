export interface LibDoc {
  name: string;
  signature: string;
  description: string;
}

/* prettier-ignore */
export const BASE_LIB_DOCS: LibDoc[] = [
  { name: "result", signature: "result(output)", description: "return { output, events: [] }" },
  { name: "ref", signature: "ref(entity)", description: "display name for output text" },
  { name: "setEvent", signature: "setEvent(entityId, {property, value, description})", description: "property change event" },
  { name: "moveEvent", signature: "moveEvent(entityId, {to, from, description})", description: "location change event" },
  { name: "createEvent", signature: "createEvent(entityId, {tags, properties, description})", description: "create a new entity (item, NPC, etc.)" },
  { name: "carried", signature: "carried()", description: "entities the player is carrying" },
  { name: "contents", signature: "contents(entityId)", description: "entities inside a container/location" },
  { name: "findKey", signature: "findKey(object)", description: "find matching key in player inventory, or null" },
  { name: "checkCarryCapacity", signature: "checkCarryCapacity()", description: "returns veto message string, or null" },
  { name: "describeRoom", signature: "describeRoom()", description: "full room description as PerformResult" },
  { name: "examine", signature: "examine(target)", description: "examine entity (description + container contents)" },
  { name: "take", signature: "take(object)", description: "pick up object → PerformResult with move event" },
  { name: "drop", signature: "drop(object)", description: "drop object in current room → PerformResult" },
  { name: "showInventory", signature: "showInventory()", description: "list carried items → PerformResult" },
  { name: "open", signature: "open(object)", description: "open container/door → PerformResult" },
  { name: "close", signature: "close(object)", description: "close container/door → PerformResult" },
  { name: "putIn", signature: "putIn(object, container)", description: "put object in container → PerformResult" },
  { name: "takeFrom", signature: "takeFrom(object, container)", description: "take object from container → PerformResult" },
  { name: "unlockWith", signature: "unlockWith(object, key)", description: "unlock with specific key → PerformResult" },
  { name: "unlock", signature: "unlock(object)", description: "auto-find key and unlock → PerformResult" },
  { name: "lock", signature: "lock(object)", description: "auto-find key and lock → PerformResult" },
  { name: "switchOn", signature: "switchOn(object)", description: "turn on device (sets switchedOn + lit)" },
  { name: "switchOff", signature: "switchOff(object)", description: "turn off device (clears switchedOn + lit)" },
  { name: "wear", signature: "wear(object)", description: "put on wearable (picks up if not carried, sets worn=true)" },
  { name: "unwear", signature: "unwear(object)", description: "take off wearable (sets worn=false, stays in inventory)" },
  { name: "showHelp", signature: "showHelp()", description: "command help text → PerformResult" },
  { name: "showScore", signature: "showScore()", description: "current score display → PerformResult" },
  { name: "incrementVisits", signature: "incrementVisits()", description: "bump room visit counter → PerformResult" },
];
