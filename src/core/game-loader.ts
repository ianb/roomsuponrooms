import { EntityStore } from "./entity.js";
import { createRegistry, defineProperty } from "./properties.js";
import { defineBaseProperties } from "./base-properties.js";
import { VerbRegistry } from "./verbs.js";
import type { GameData, EntityData, HandlerData, PropertyData } from "./game-data.js";
import { handlerDataToHandler } from "./handler-eval.js";
import type { LibFactory } from "./handler-eval.js";
import { DEFAULT_HANDLERS } from "./default-handlers.js";
import { HandlerLib } from "./handler-lib.js";

export interface LoadedGame {
  store: EntityStore;
  verbs: VerbRegistry;
  libClass: typeof HandlerLib;
  prompts?: GameData["prompts"];
  conversations?: GameData["conversations"];
}

export interface LoadGameOptions {
  libFactory?: LibFactory;
  libClass?: typeof HandlerLib;
}

/**
 * Parse JSONL game data into a GameData object.
 *
 * Format:
 * - First line: header with "meta" key, optional "properties" array
 * - Remaining lines: objects with "id" (entities) or "name"+"pattern" (handlers)
 */
export function parseGameDataJsonl(content: string): GameData {
  const lines = content.split("\n").filter((line) => line.trim());
  if (lines.length === 0) {
    throw new EmptyGameDataError();
  }

  const firstLine = lines[0]!;
  const header = JSON.parse(firstLine) as {
    meta: GameData["meta"];
    properties?: PropertyData[];
  };
  if (!header.meta) {
    throw new MissingMetaError();
  }

  const entities: EntityData[] = [];
  const handlers: HandlerData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const obj = JSON.parse(lines[i]!) as Record<string, unknown>;
    if ("id" in obj) {
      entities.push(obj as unknown as EntityData);
    } else if ("pattern" in obj && "perform" in obj) {
      handlers.push(obj as unknown as HandlerData);
    }
  }

  return {
    meta: header.meta,
    properties: header.properties,
    entities,
    handlers: handlers.length > 0 ? handlers : undefined,
  };
}

class EmptyGameDataError extends Error {
  constructor() {
    super("Empty game data file");
    this.name = "EmptyGameDataError";
  }
}

class MissingMetaError extends Error {
  constructor() {
    super("First line must contain a 'meta' field");
    this.name = "MissingMetaError";
  }
}

/** Load a game from a GameData object. */
export function loadGameData(data: GameData, options?: LoadGameOptions): LoadedGame {
  const registry = createRegistry();
  defineBaseProperties(registry);

  if (data.properties) {
    for (const prop of data.properties) {
      defineProperty(registry, prop);
    }
  }

  const store = new EntityStore(registry, data.meta.seed || 1);
  for (const entityData of data.entities) {
    store.create(entityData.id, {
      tags: entityData.tags,
      name: entityData.name,
      description: entityData.description,
      location: entityData.location,
      aliases: entityData.aliases,
      secret: entityData.secret,
      scenery: entityData.scenery,
      exit: entityData.exit,
      room: entityData.room,
      ai: entityData.ai,
      properties: entityData.properties,
    });
  }

  const libOpts = options && options.libFactory ? { libFactory: options.libFactory } : undefined;

  const verbs = new VerbRegistry();
  for (const handlerData of DEFAULT_HANDLERS) {
    verbs.register(handlerDataToHandler(handlerData, libOpts));
  }
  if (data.handlers) {
    for (const handlerData of data.handlers) {
      verbs.register(handlerDataToHandler(handlerData, libOpts));
    }
  }

  const libClass = (options && options.libClass) || HandlerLib;
  return {
    store,
    verbs,
    libClass,
    prompts: data.prompts,
    conversations: data.conversations,
  };
}
