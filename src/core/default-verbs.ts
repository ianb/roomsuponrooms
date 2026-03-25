import { VerbRegistry } from "./verbs.js";
import { DEFAULT_HANDLERS } from "./default-handlers.js";
import { handlerDataToHandler } from "./handler-eval.js";

export function createDefaultVerbs(): VerbRegistry {
  const registry = new VerbRegistry();
  for (const handlerData of DEFAULT_HANDLERS) {
    registry.register(handlerDataToHandler(handlerData));
  }
  return registry;
}
