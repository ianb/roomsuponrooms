import type { Entity } from "../../core/entity.js";
import type { VerbContext, WorldEvent } from "../../core/verb-types.js";
import { HandlerLib } from "../../core/handler-lib.js";
import type { LibDoc } from "../../core/handler-lib.js";

/**
 * Extended handler library for Colossal Cave Adventure.
 * Provides game-specific helpers for randomness, scoring, teleportation, etc.
 */
export class ColossalCaveLib extends HandlerLib {
  static override libDocs: LibDoc[] = [
    ...HandlerLib.libDocs,
    {
      name: "chance",
      signature: "chance(probability)",
      description: "true with probability 0-1 (seeded random)",
    },
    {
      name: "odds",
      signature: "odds(n, d)",
      description: "true with odds n in d (e.g., 1 in 100)",
    },
    { name: "get", signature: "get(id)", description: "get entity by ID (throws if missing)" },
    { name: "tryGet", signature: "tryGet(id)", description: "get entity by ID, or null" },
    { name: "has", signature: "has(id)", description: "check if entity exists" },
    { name: "findByTag", signature: "findByTag(tag)", description: "all entities with tag" },
    {
      name: "getContentsDeep",
      signature: "getContentsDeep(entityId)",
      description: "nested contents including children of children",
    },
    {
      name: "setProp",
      signature: "setProp(entityId, {property, value, description})",
      description: "property change event (alias for setEvent)",
    },
    {
      name: "moveTo",
      signature: "moveTo(entityId, {to, description})",
      description: "move event (no from required)",
    },
    {
      name: "teleport",
      signature: "teleport(from, to)",
      description: "player teleport → WorldEvent[]",
    },
    {
      name: "addScore",
      signature: "addScore(delta)",
      description: "add to player score immediately",
    },
    {
      name: "scoreEvent",
      signature: "scoreEvent(delta, description)",
      description: "score change event for log",
    },
    {
      name: "setProperty",
      signature: "setProperty(id, {name, value})",
      description: "set entity property immediately (not event-based)",
    },
    {
      name: "createEntity",
      signature: "createEntity(id, {tags, properties})",
      description: "create new entity in store",
    },
    {
      name: "getExitDestinations",
      signature: "getExitDestinations(roomId)",
      description: "list of room IDs reachable via exits from a room",
    },
  ];

  constructor(context: VerbContext) {
    super(context);
  }

  // --- Random ---

  /** Return true with the given probability (0-1) */
  chance(probability: number): boolean {
    return this.store.random.chance(probability);
  }

  /** Return true with odds of n in d (e.g., 1 in 100) */
  odds(n: number, d: number): boolean {
    return this.store.random.odds(n, d);
  }

  // --- Entity shortcuts ---

  /** Get an entity by ID (throws if not found) */
  get(id: string): Entity {
    return this.store.get(id);
  }

  /** Get an entity by ID, or null if not found */
  tryGet(id: string): Entity | null {
    return this.store.tryGet(id);
  }

  /** Check if an entity exists */
  has(id: string): boolean {
    return this.store.has(id);
  }

  /** Find all entities with a given tag */
  findByTag(tag: string): Entity[] {
    return this.store.findByTag(tag);
  }

  /** Get all contents of an entity, including nested contents */
  getContentsDeep(entityId: string): Entity[] {
    return this.store.getContentsDeep(entityId);
  }

  // --- Simplified event helpers ---

  /** Create a set-property event (simplified signature) */
  setProp(
    entityId: string,
    { property, value, description }: { property: string; value: unknown; description: string },
  ): WorldEvent {
    return this.setEvent(entityId, { property, value, description });
  }

  /** Create a move-to-location event (simplified — no `from` required) */
  moveTo(entityId: string, { to, description }: { to: string; description: string }): WorldEvent {
    return {
      type: "set-property",
      entityId,
      property: "location",
      value: to,
      description,
    };
  }

  // --- Teleportation ---

  /** Teleport the player between two rooms. Returns events array. */
  teleport(from: string, to: string): WorldEvent[] {
    return [
      {
        type: "set-property",
        entityId: this.player.id,
        property: "location",
        value: to,
        oldValue: from,
        description: "Teleported by magic word",
      },
    ];
  }

  // --- Scoring ---

  /** Add points to the player's score (mutates immediately) */
  addScore(delta: number): void {
    const current = this.player.properties.score || 0;
    this.store.setProperty(this.player.id, { name: "score", value: current + delta });
  }

  /** Create a score-change event for the event log */
  scoreEvent(delta: number, description: string): WorldEvent {
    return {
      type: "score-change",
      entityId: this.player.id,
      property: "score",
      value: delta,
      description,
    };
  }

  // --- Map navigation ---

  /** Get list of room IDs reachable from a given room via exits */
  getExitDestinations(roomId: string): string[] {
    const exits = this.store.getExits(roomId);
    const destinations: string[] = [];
    for (const exit of exits) {
      const dest = exit.exit && exit.exit.destination;
      if (dest && this.store.has(dest)) destinations.push(dest);
    }
    return destinations;
  }

  // --- Direct property mutation ---

  /** Set a property on an entity immediately (not event-based) */
  setProperty(id: string, { name, value }: { name: string; value: unknown }): void {
    this.store.setProperty(id, { name, value });
  }

  // --- Entity creation (for crystal bridge) ---

  /** Create a new entity in the store (accepts legacy properties format) */
  createEntity(
    id: string,
    { tags, properties }: { tags: string[]; properties: Record<string, unknown> },
  ): Entity {
    const opts: Record<string, unknown> = { tags };
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(properties)) {
      if (k === "name" || k === "description" || k === "location") {
        opts[k] = v;
      } else if (k === "direction" || k === "destination" || k === "destinationIntent") {
        if (!opts["exit"]) opts["exit"] = {};
        (opts["exit"] as Record<string, unknown>)[k] = v;
      } else {
        rest[k] = v;
      }
    }
    if (Object.keys(rest).length > 0) opts["properties"] = rest;
    return this.store.create(id, opts as Parameters<typeof this.store.create>[1]);
  }
}

export function createCaveLib(context: VerbContext): ColossalCaveLib {
  return new ColossalCaveLib(context);
}
