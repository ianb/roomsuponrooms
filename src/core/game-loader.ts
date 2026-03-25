import { EntityStore } from "./entity.js";
import { createRegistry, defineProperty } from "./properties.js";
import { defineBaseProperties } from "./base-properties.js";
import { VerbRegistry } from "./verbs.js";
import type { GameData } from "./game-data.js";
import { handlerDataToHandler } from "./handler-eval.js";
import { DEFAULT_HANDLERS } from "./default-handlers.js";

export interface LoadedGame {
  store: EntityStore;
  verbs: VerbRegistry;
}

/** Load a game from a GameData object (parsed from JSON). */
export function loadGameData(data: GameData): LoadedGame {
  const registry = createRegistry();
  defineBaseProperties(registry);

  if (data.properties) {
    for (const prop of data.properties) {
      defineProperty(registry, prop);
    }
  }

  const store = new EntityStore(registry, 1);
  for (const entityData of data.entities) {
    store.create(entityData.id, {
      tags: entityData.tags,
      properties: entityData.properties,
    });
  }

  const verbs = new VerbRegistry();
  for (const handlerData of DEFAULT_HANDLERS) {
    verbs.register(handlerDataToHandler(handlerData));
  }
  if (data.handlers) {
    for (const handlerData of data.handlers) {
      verbs.register(handlerDataToHandler(handlerData));
    }
  }

  return { store, verbs };
}
