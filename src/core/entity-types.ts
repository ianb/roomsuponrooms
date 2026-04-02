import type { PropertyBag } from "./properties.js";

/** Nominal string type for entity references (plain string alias) */
export type EntityId = string;

/** Scenery descriptions stored on room entities */
export interface SceneryEntry {
  word: string;
  aliases?: string[];
  description: string;
  rejection: string;
}

export interface Entity {
  id: EntityId;
  tags: string[];
  name: string;
  description: string;
  location: EntityId;
  aliases: string[];
  secret?: string;
  scenery: SceneryEntry[];

  exit?: {
    direction: string;
    destination?: EntityId;
    destinationIntent?: string;
  };

  room?: {
    darkWhenUnlit: boolean;
    visits: number;
    grid?: { x: number; y: number; z: number };
  };

  ai?: {
    prompt?: string;
    conversationPrompt?: string;
  };

  /** Extensible property bag for game-specific properties */
  properties: PropertyBag;
}

export interface CreateEntityOptions {
  tags?: string[];
  name?: string;
  description?: string;
  location?: EntityId;
  aliases?: string[];
  secret?: string;
  scenery?: SceneryEntry[];
  exit?: {
    direction: string;
    destination?: EntityId;
    destinationIntent?: string;
  };
  room?: {
    darkWhenUnlit?: boolean;
    visits?: number;
    grid?: { x: number; y: number; z: number };
  };
  ai?: {
    prompt?: string;
    conversationPrompt?: string;
  };
  properties?: PropertyBag;
}

/** Serializable snapshot of an entity's state */
export interface EntitySnapshot {
  id: EntityId;
  tags: string[];
  name: string;
  description: string;
  location: EntityId;
  aliases: string[];
  secret?: string;
  scenery: SceneryEntry[];
  exit?: {
    direction: string;
    destination?: EntityId;
    destinationIntent?: string;
  };
  room?: {
    darkWhenUnlit: boolean;
    visits: number;
    grid?: { x: number; y: number; z: number };
  };
  ai?: {
    prompt?: string;
    conversationPrompt?: string;
  };
  properties: PropertyBag;
}

/** Deep-clone an entity into a serializable snapshot */
export function snapshotEntity(entity: Entity): EntitySnapshot {
  const snap: EntitySnapshot = {
    id: entity.id,
    tags: [...entity.tags],
    name: entity.name,
    description: entity.description,
    location: entity.location,
    aliases: [...entity.aliases],
    scenery: entity.scenery.map((s) => ({ ...s })),
    properties: { ...entity.properties },
  };
  if (entity.secret !== undefined) snap.secret = entity.secret;
  if (entity.exit) snap.exit = { ...entity.exit };
  if (entity.room) {
    snap.room = { darkWhenUnlit: entity.room.darkWhenUnlit, visits: entity.room.visits };
    if (entity.room.grid) snap.room.grid = { ...entity.room.grid };
  }
  if (entity.ai) snap.ai = { ...entity.ai };
  return snap;
}

/** Reconstruct an Entity from a snapshot */
export function entityFromSnapshot(snap: EntitySnapshot): Entity {
  const entity: Entity = {
    id: snap.id,
    tags: [...snap.tags],
    name: snap.name,
    description: snap.description,
    location: snap.location,
    aliases: [...snap.aliases],
    scenery: snap.scenery.map((s) => ({ ...s })),
    properties: { ...snap.properties },
  };
  if (snap.secret !== undefined) entity.secret = snap.secret;
  if (snap.exit) entity.exit = { ...snap.exit };
  if (snap.room) {
    entity.room = { darkWhenUnlit: snap.room.darkWhenUnlit, visits: snap.room.visits };
    if (snap.room.grid) entity.room.grid = { ...snap.room.grid };
  }
  if (snap.ai) entity.ai = { ...snap.ai };
  return entity;
}
