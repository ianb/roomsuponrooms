import type { PropertyRegistry, PropertyDefinition } from "./properties.js";
import { validateValue } from "./properties.js";
import { SeededRandom } from "./random.js";
import {
  EntityNotFoundError,
  DuplicateEntityError,
  InvalidEntityIdError,
  UndefinedPropertyError,
  DanglingReferenceError,
  PropertyValueError,
} from "./entity-errors.js";
import type { Entity, EntitySnapshot, CreateEntityOptions } from "./entity-types.js";
import { snapshotEntity, entityFromSnapshot } from "./entity-types.js";

export type {
  EntityId,
  SceneryEntry,
  Entity,
  EntitySnapshot,
  CreateEntityOptions,
} from "./entity-types.js";
export { snapshotEntity, entityFromSnapshot } from "./entity-types.js";

export const VOID_LOCATION = "void";
export const WORLD_LOCATION = "world";

export class EntityStore {
  private entities: Map<string, Entity> = new Map();
  private locationIndex: Map<string, Set<string>> = new Map();
  private nextId = 1;
  private initialState: Map<string, EntitySnapshot> = new Map();
  readonly registry: PropertyRegistry;
  readonly random: SeededRandom;

  constructor(registry: PropertyRegistry, seed: number) {
    this.registry = registry;
    this.random = new SeededRandom(seed);
  }

  snapshot(): void {
    this.initialState.clear();
    for (const entity of this.entities.values()) {
      this.initialState.set(entity.id, snapshotEntity(entity));
    }
  }

  getInitialState(id: string): EntitySnapshot | null {
    return this.initialState.get(id) || null;
  }

  getAllIds(): string[] {
    return Array.from(this.entities.keys());
  }

  getSnapshot(id: string): EntitySnapshot {
    return snapshotEntity(this.get(id));
  }

  generateId(prefix: string): string {
    const id = `${prefix}-${this.nextId}`;
    this.nextId += 1;
    return id;
  }

  create(id: string, options: CreateEntityOptions): Entity {
    if (!id.includes(":")) {
      throw new InvalidEntityIdError(id);
    }
    if (this.entities.has(id)) {
      throw new DuplicateEntityError(id);
    }
    const rawProps = options.properties || {};
    const props: Record<string, unknown> = {};
    for (const [propName, propValue] of Object.entries(rawProps)) {
      if (propValue === null || propValue === undefined) continue;
      const def = this.registry.definitions[propName];
      if (!def) throw new UndefinedPropertyError(propName);
      const errors = validateValue(this.registry, { name: propName, value: propValue });
      if (errors.length > 0) throw new PropertyValueError(propName, errors);
      props[propName] = propValue;
    }

    const entity: Entity = {
      id,
      tags: options.tags ? [...options.tags] : [],
      name: options.name || id,
      description: options.description || "",
      location: options.location || VOID_LOCATION,
      aliases: options.aliases ? [...options.aliases] : [],
      scenery: options.scenery ? [...options.scenery] : [],
      properties: { ...props },
    };
    if (options.secret !== undefined) entity.secret = options.secret;
    if (options.exit) {
      entity.exit = {
        direction: options.exit.direction,
        destination: options.exit.destination,
        destinationIntent: options.exit.destinationIntent,
      };
    }
    if (options.room) {
      entity.room = {
        darkWhenUnlit: options.room.darkWhenUnlit || false,
        visits: options.room.visits || 0,
      };
      if (options.room.grid) entity.room.grid = { ...options.room.grid };
    }
    if (options.ai) entity.ai = { ...options.ai };
    // Ensure room facet exists for room-tagged entities
    if (!entity.room && entity.tags.includes("room")) {
      entity.room = { darkWhenUnlit: false, visits: 0 };
    }

    this.entities.set(id, entity);
    this.addToLocationIndex(entity.location, id);
    return entity;
  }

  get(id: string): Entity {
    const entity = this.entities.get(id);
    if (!entity) throw new EntityNotFoundError(id);
    return entity;
  }
  tryGet(id: string): Entity | null {
    return this.entities.get(id) || null;
  }
  has(id: string): boolean {
    return this.entities.has(id);
  }

  delete(id: string): void {
    const entity = this.tryGet(id);
    if (!entity) return;
    for (const child of this.getContents(id)) {
      this.delete(child.id);
    }
    this.removeFromLocationIndex(entity.location, id);
    this.entities.delete(id);
  }

  setLocation(id: string, newLocation: string): void {
    const entity = this.get(id);
    const oldLocation = entity.location;
    entity.location = newLocation;
    this.removeFromLocationIndex(oldLocation, id);
    this.addToLocationIndex(newLocation, id);
  }

  setProperty(id: string, assignment: { name: string; value: unknown }): void {
    const entity = this.get(id);
    const { name, value } = assignment;
    // Route typed fields to their proper locations
    switch (name) {
      case "location":
        if (value === null || value === undefined) return;
        this.setLocation(id, value as string);
        return;
      case "name":
        entity.name = (value as string) || entity.id;
        return;
      case "description":
        entity.description = (value as string) || "";
        return;
      case "visits":
        if (entity.room) entity.room.visits = (value as number) || 0;
        return;
    }
    if (value === null || value === undefined) {
      delete entity.properties[name];
      return;
    }
    const def = this.registry.definitions[name];
    if (!def) throw new UndefinedPropertyError(name);
    const errors = validateValue(this.registry, { name, value });
    if (errors.length > 0) throw new PropertyValueError(name, errors);
    this.validateEntityRef(def, value);
    entity.properties[name] = value;
  }

  removeProperty(id: string, name: string): void {
    delete this.get(id).properties[name];
  }
  getProperty<T>(id: string, name: string): T | undefined {
    return this.get(id).properties[name] as T | undefined;
  }

  addTag(id: string, tag: string): void {
    const tags = this.get(id).tags;
    if (!tags.includes(tag)) tags.push(tag);
  }

  removeTag(id: string, tag: string): void {
    const entity = this.get(id);
    const idx = entity.tags.indexOf(tag);
    if (idx !== -1) entity.tags.splice(idx, 1);
  }

  hasTag(id: string, tag: string): boolean {
    return this.get(id).tags.includes(tag);
  }

  getContents(locationId: string): Entity[] {
    const ids = this.locationIndex.get(locationId);
    if (!ids) return [];
    const result: Entity[] = [];
    for (const id of ids) {
      const entity = this.entities.get(id);
      if (entity) result.push(entity);
    }
    return result;
  }

  getContentsDeep(locationId: string): Entity[] {
    const result: Entity[] = [];
    const queue = [locationId];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const child of this.getContents(current)) {
        result.push(child);
        queue.push(child.id);
      }
    }
    return result;
  }

  findContaining(entityId: string, tag: string): Entity | null {
    let currentId = entityId;
    const visited = new Set<string>();
    while (currentId) {
      if (visited.has(currentId)) return null;
      visited.add(currentId);
      const entity = this.tryGet(currentId);
      if (!entity) return null;
      if (entity.tags.includes(tag) && entity.id !== entityId) return entity;
      if (
        !entity.location ||
        entity.location === VOID_LOCATION ||
        entity.location === WORLD_LOCATION
      )
        return null;
      currentId = entity.location;
    }
    return null;
  }

  getLocationChain(entityId: string): Entity[] {
    const chain: Entity[] = [];
    let currentId = entityId;
    const visited = new Set<string>();
    while (currentId) {
      if (visited.has(currentId)) break;
      visited.add(currentId);
      const entity = this.tryGet(currentId);
      if (!entity) break;
      chain.push(entity);
      if (
        !entity.location ||
        entity.location === VOID_LOCATION ||
        entity.location === WORLD_LOCATION
      )
        break;
      currentId = entity.location;
    }
    return chain;
  }

  findByTag(tag: string): Entity[] {
    const result: Entity[] = [];
    for (const entity of this.entities.values()) {
      if (entity.tags.includes(tag)) result.push(entity);
    }
    return result;
  }

  findByTagAt(tag: string, locationId: string): Entity[] {
    return this.getContents(locationId).filter((e) => e.tags.includes(tag));
  }

  getExits(roomId: string): Entity[] {
    return this.findByTagAt("exit", roomId);
  }

  saveState(): EntitySnapshot[] {
    const snapshots: EntitySnapshot[] = [];
    for (const entity of this.entities.values()) {
      snapshots.push(snapshotEntity(entity));
    }
    return snapshots;
  }

  restoreState(snapshots: EntitySnapshot[]): void {
    this.entities.clear();
    this.locationIndex.clear();
    for (const snap of snapshots) {
      const entity = entityFromSnapshot(snap);
      this.entities.set(entity.id, entity);
      this.addToLocationIndex(entity.location, entity.id);
    }
  }

  private addToLocationIndex(locationId: string, entityId: string): void {
    let set = this.locationIndex.get(locationId);
    if (!set) {
      set = new Set();
      this.locationIndex.set(locationId, set);
    }
    set.add(entityId);
  }

  private validateEntityRef(def: PropertyDefinition, value: unknown): void {
    if (def.schema.format !== "entity-ref") return;
    if (typeof value !== "string") return;
    if (value === VOID_LOCATION || value === WORLD_LOCATION) return;
    if (!this.entities.has(value)) throw new DanglingReferenceError(def.name, value);
  }

  private removeFromLocationIndex(locationId: string, entityId: string): void {
    const set = this.locationIndex.get(locationId);
    if (set) {
      set.delete(entityId);
      if (set.size === 0) this.locationIndex.delete(locationId);
    }
  }
}
