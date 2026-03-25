import type { PropertyRegistry, PropertyBag, PropertyDefinition } from "./properties.js";
import { validateValue } from "./properties.js";
import { SeededRandom } from "./random.js";
import {
  EntityNotFoundError,
  DuplicateEntityError,
  UndefinedPropertyError,
  DanglingReferenceError,
  PropertyValueError,
} from "./entity-errors.js";

export interface Entity {
  id: string;
  tags: Set<string>;
  properties: PropertyBag;
}

export const VOID_LOCATION = "void";
export const WORLD_LOCATION = "world";

interface CreateEntityOptions {
  tags?: string[];
  properties?: PropertyBag;
}

/** Serializable snapshot of an entity's state */
export interface EntitySnapshot {
  id: string;
  tags: string[];
  properties: PropertyBag;
}

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

  /** Save the current state of all entities as the baseline for diff tracking */
  snapshot(): void {
    this.initialState.clear();
    for (const entity of this.entities.values()) {
      this.initialState.set(entity.id, {
        id: entity.id,
        tags: Array.from(entity.tags),
        properties: { ...entity.properties },
      });
    }
  }

  /** Get the initial snapshot of an entity, or null if it was created after snapshot */
  getInitialState(id: string): EntitySnapshot | null {
    return this.initialState.get(id) || null;
  }

  /** Get all entity IDs */
  getAllIds(): string[] {
    return Array.from(this.entities.keys());
  }

  /** Get a serializable snapshot of an entity's current state */
  getSnapshot(id: string): EntitySnapshot {
    const entity = this.get(id);
    return {
      id: entity.id,
      tags: Array.from(entity.tags),
      properties: { ...entity.properties },
    };
  }

  generateId(prefix: string): string {
    const id = `${prefix}-${this.nextId}`;
    this.nextId += 1;
    return id;
  }

  create(id: string, options: CreateEntityOptions): Entity {
    if (this.entities.has(id)) {
      throw new DuplicateEntityError(id);
    }
    // Validate all initial properties against the registry
    const props = options.properties || {};
    for (const [propName, propValue] of Object.entries(props)) {
      const def = this.registry.definitions[propName];
      if (!def) {
        throw new UndefinedPropertyError(propName);
      }
      const errors = validateValue(this.registry, { name: propName, value: propValue });
      if (errors.length > 0) {
        throw new PropertyValueError(propName, errors);
      }
    }

    const entity: Entity = {
      id,
      tags: new Set(options.tags || []),
      properties: { ...props },
    };
    this.entities.set(id, entity);

    const location = (entity.properties["location"] as string) || VOID_LOCATION;
    this.addToLocationIndex(location, id);

    return entity;
  }

  get(id: string): Entity {
    const entity = this.entities.get(id);
    if (!entity) {
      throw new EntityNotFoundError(id);
    }
    return entity;
  }

  tryGet(id: string): Entity | null {
    return this.entities.get(id) || null;
  }

  has(id: string): boolean {
    return this.entities.has(id);
  }

  /** Remove an entity from the store. Also removes any entities contained within it. */
  delete(id: string): void {
    const entity = this.tryGet(id);
    if (!entity) return;
    // Recursively delete contents
    const contents = this.getContents(id);
    for (const child of contents) {
      this.delete(child.id);
    }
    // Remove from location index
    const location = (entity.properties["location"] as string) || VOID_LOCATION;
    this.removeFromLocationIndex(location, id);
    this.entities.delete(id);
  }

  setProperty(id: string, assignment: { name: string; value: unknown }): void {
    const entity = this.get(id);
    const { name, value } = assignment;

    // Property must be defined in the registry
    const def = this.registry.definitions[name];
    if (!def) {
      throw new UndefinedPropertyError(name);
    }
    const errors = validateValue(this.registry, { name, value });
    if (errors.length > 0) {
      throw new PropertyValueError(name, errors);
    }
    // Check entity-ref integrity
    this.validateEntityRef(def, value);

    const oldValue = entity.properties[name];
    entity.properties[name] = value;

    if (name === "location") {
      const oldLocation = (oldValue as string) || VOID_LOCATION;
      const newLocation = (value as string) || VOID_LOCATION;
      this.removeFromLocationIndex(oldLocation, id);
      this.addToLocationIndex(newLocation, id);
    }
  }

  removeProperty(id: string, name: string): void {
    const entity = this.get(id);
    const oldValue = entity.properties[name];
    delete entity.properties[name];

    if (name === "location") {
      const oldLocation = (oldValue as string) || VOID_LOCATION;
      this.removeFromLocationIndex(oldLocation, id);
      this.addToLocationIndex(VOID_LOCATION, id);
    }
  }

  getProperty<T>(id: string, name: string): T | undefined {
    return this.get(id).properties[name] as T | undefined;
  }

  addTag(id: string, tag: string): void {
    this.get(id).tags.add(tag);
  }

  removeTag(id: string, tag: string): void {
    this.get(id).tags.delete(tag);
  }

  hasTag(id: string, tag: string): boolean {
    return this.get(id).tags.has(tag);
  }

  /** Get direct children at a location */
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

  /** Get all entities transitively contained within a location */
  getContentsDeep(locationId: string): Entity[] {
    const result: Entity[] = [];
    const queue = [locationId];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const children = this.getContents(current);
      for (const child of children) {
        result.push(child);
        queue.push(child.id);
      }
    }
    return result;
  }

  /** Walk up the location chain to find the containing entity with a given tag */
  findContaining(entityId: string, tag: string): Entity | null {
    let currentId = entityId;
    const visited = new Set<string>();
    while (currentId) {
      if (visited.has(currentId)) return null;
      visited.add(currentId);
      const entity = this.tryGet(currentId);
      if (!entity) return null;
      if (entity.tags.has(tag) && entity.id !== entityId) return entity;
      const location = entity.properties["location"] as string | undefined;
      if (!location || location === VOID_LOCATION || location === WORLD_LOCATION) return null;
      currentId = location;
    }
    return null;
  }

  /** Walk up the location chain to get the full path from entity to root */
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
      const location = entity.properties["location"] as string | undefined;
      if (!location || location === VOID_LOCATION || location === WORLD_LOCATION) break;
      currentId = location;
    }
    return chain;
  }

  /** Find all entities with a given tag */
  findByTag(tag: string): Entity[] {
    const result: Entity[] = [];
    for (const entity of this.entities.values()) {
      if (entity.tags.has(tag)) {
        result.push(entity);
      }
    }
    return result;
  }

  /** Find entities at a location with a specific tag */
  findByTagAt(tag: string, locationId: string): Entity[] {
    return this.getContents(locationId).filter((e) => e.tags.has(tag));
  }

  /** Get exits from a room (exit entities whose location is this room) */
  getExits(roomId: string): Entity[] {
    return this.findByTagAt("exit", roomId);
  }

  /** Serialize the full store state for undo/save */
  saveState(): EntitySnapshot[] {
    const snapshots: EntitySnapshot[] = [];
    for (const entity of this.entities.values()) {
      snapshots.push({
        id: entity.id,
        tags: Array.from(entity.tags),
        properties: { ...entity.properties },
      });
    }
    return snapshots;
  }

  /** Restore from a saved state, replacing all entities */
  restoreState(snapshots: EntitySnapshot[]): void {
    this.entities.clear();
    this.locationIndex.clear();
    for (const snap of snapshots) {
      const entity: Entity = {
        id: snap.id,
        tags: new Set(snap.tags),
        properties: { ...snap.properties },
      };
      this.entities.set(entity.id, entity);
      const location = (entity.properties["location"] as string) || VOID_LOCATION;
      this.addToLocationIndex(location, entity.id);
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

  /**
   * Validate entity-ref format: the referenced entity must exist,
   * or be a known special location (void, world).
   */
  private validateEntityRef(def: PropertyDefinition, value: unknown): void {
    if (def.schema.format !== "entity-ref") return;
    if (typeof value !== "string") return;
    if (value === VOID_LOCATION || value === WORLD_LOCATION) return;
    if (!this.entities.has(value)) {
      throw new DanglingReferenceError(def.name, value);
    }
  }

  private removeFromLocationIndex(locationId: string, entityId: string): void {
    const set = this.locationIndex.get(locationId);
    if (set) {
      set.delete(entityId);
      if (set.size === 0) {
        this.locationIndex.delete(locationId);
      }
    }
  }
}
