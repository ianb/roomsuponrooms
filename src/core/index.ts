export { processCommand } from "./world.js";
export type { CommandResult } from "./world.js";
export { createSampleWorld } from "./sample-world.js";

export type { JSONSchema7, JSONSchema7Type } from "./json-schema.js";

export {
  createRegistry,
  defineProperty,
  validateValue,
  getProperty,
  setProperty,
  getPropertyWithDefault,
} from "./properties.js";
export type { PropertyDefinition, PropertyRegistry, PropertyBag } from "./properties.js";

export { EntityStore, VOID_LOCATION, WORLD_LOCATION } from "./entity.js";
export type { Entity } from "./entity.js";

export { VerbRegistry, parseCommand, resolveCommand } from "./verbs.js";
export type { VerbHandler, VerbContext, VerbPattern } from "./verbs.js";

export { SYSTEM_VERBS } from "./verb-types.js";

export { createDefaultVerbs } from "./default-verbs.js";
export { describeRoomFull, entityRef } from "./describe.js";
export { defineBaseProperties } from "./base-properties.js";
export { createGameRunner } from "./game-runner.js";
export type { GameRunner } from "./game-runner.js";
