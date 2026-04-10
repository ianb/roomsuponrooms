import type { Entity, EntityStore } from "../core/entity.js";
import type { VerbHandler } from "../core/verb-types.js";

/**
 * The shape of an entity returned by the query tool. Includes the raw entity
 * fields plus two enrichments computed at view-build time:
 *
 * - `containedBy`: the chain of ancestor location ids walking up to the root,
 *   in order from immediate parent to root. Lets the agent answer "is this
 *   transitively contained in X?" with a single jq filter:
 *     `[.[] | select(.containedBy | index("room:gate"))]`
 *
 * - `destinationName`: for entities tagged "exit", the resolved name of the
 *   destination room (or null if missing). Saves the agent a follow-up
 *   lookup when reading exits.
 */
export interface EntityView {
  id: string;
  tags: string[];
  name: string;
  description: string;
  location: string;
  containedBy: string[];
  destinationName?: string | null;
  aliases?: string[];
  secret?: string;
  scenery?: Entity["scenery"];
  exit?: Entity["exit"];
  room?: Entity["room"];
  ai?: Entity["ai"];
  properties?: Record<string, unknown>;
}

/**
 * The result of `get(id)` with optional `withChildren` and `withNeighborhood`
 * flags. The base shape is an EntityView; setting flags adds extra fields.
 */
export interface GetView extends EntityView {
  /** Set when withChildren=true. Direct contents of this entity (one level). */
  children?: EntityView[];
  /** Set when withNeighborhood=true. Reachable rooms via this room's exits. */
  neighbors?: NeighborhoodEntry[];
}

export interface NeighborhoodEntry {
  via: { id: string; direction: string };
  room: GetView;
}

export interface HandlerView {
  name: string;
  source?: string;
  verb: string;
  verbAliases?: string[];
  form: string;
  prep?: string;
  priority: number;
  freeTurn?: boolean;
  entityId?: string;
  tag?: string;
  hasCheck: boolean;
  hasVeto: boolean;
}

// --- Helpers ---

function computeContainedBy(store: EntityStore, entityId: string): string[] {
  const chain: string[] = [];
  const visited = new Set<string>([entityId]);
  let current: string | undefined = store.has(entityId) ? store.get(entityId).location : undefined;
  while (current && !visited.has(current)) {
    chain.push(current);
    visited.add(current);
    if (!store.has(current)) break;
    current = store.get(current).location;
    if (!current) break;
  }
  return chain;
}

export function entityToView(store: EntityStore, e: Entity): EntityView {
  const view: EntityView = {
    id: e.id,
    tags: e.tags,
    name: e.name,
    description: e.description,
    location: e.location,
    containedBy: computeContainedBy(store, e.id),
  };
  if (e.aliases && e.aliases.length > 0) view.aliases = e.aliases;
  if (e.secret) view.secret = e.secret;
  if (e.scenery && e.scenery.length > 0) view.scenery = e.scenery;
  if (e.exit) {
    view.exit = e.exit;
    const dest = e.exit.destination;
    view.destinationName = dest && store.has(dest) ? store.get(dest).name : null;
  }
  if (e.room) view.room = e.room;
  if (e.ai) view.ai = e.ai;
  if (Object.keys(e.properties).length > 0) view.properties = e.properties;
  return view;
}

export function handlerPatternView(handler: VerbHandler): HandlerView {
  return {
    name: handler.name,
    source: handler.source,
    verb: handler.pattern.verb,
    verbAliases: handler.pattern.verbAliases,
    form: handler.pattern.form,
    prep: handler.pattern.prep,
    priority: handler.priority,
    freeTurn: handler.freeTurn,
    entityId: handler.entityId,
    tag: handler.tag,
    hasCheck: !!handler.check,
    hasVeto: !!handler.veto,
  };
}

/**
 * Build the result of `get(id, withChildren?, withNeighborhood?, depth?)`.
 *
 * Adds `children` (direct contents) and/or `neighbors` (rooms reachable via
 * exits walked recursively up to `depth`) to the base entity view, depending
 * on which flags are set. The neighborhood walk uses a visited set to handle
 * cycles. Each neighbor room is itself a GetView with its own neighbors[]
 * recursively populated when depth > 1.
 */
export function buildGetView(
  store: EntityStore,
  {
    id,
    withChildren,
    withNeighborhood,
    depth,
  }: {
    id: string;
    withChildren: boolean;
    withNeighborhood: boolean;
    depth: number;
  },
): GetView | null {
  if (!store.has(id)) return null;
  const visited = new Set<string>();
  return buildGetViewRecursive(store, {
    id,
    withChildren,
    withNeighborhood,
    remainingDepth: depth,
    visited,
  });
}

function buildGetViewRecursive(
  store: EntityStore,
  {
    id,
    withChildren,
    withNeighborhood,
    remainingDepth,
    visited,
  }: {
    id: string;
    withChildren: boolean;
    withNeighborhood: boolean;
    remainingDepth: number;
    visited: Set<string>;
  },
): GetView | null {
  if (!store.has(id)) return null;
  visited.add(id);
  const entity = store.get(id);
  const view: GetView = entityToView(store, entity);
  if (withChildren) {
    view.children = store.getContents(id).map((child) => entityToView(store, child));
  }
  if (withNeighborhood && remainingDepth > 0) {
    const neighbors: NeighborhoodEntry[] = [];
    for (const child of store.getContents(id)) {
      if (!child.tags.includes("exit")) continue;
      const dest = child.exit && child.exit.destination;
      if (!dest || visited.has(dest)) continue;
      if (!store.has(dest)) continue;
      const neighborRoom = buildGetViewRecursive(store, {
        id: dest,
        withChildren,
        withNeighborhood,
        remainingDepth: remainingDepth - 1,
        visited,
      });
      if (!neighborRoom) continue;
      neighbors.push({
        via: { id: child.id, direction: (child.exit && child.exit.direction) || "" },
        room: neighborRoom,
      });
    }
    view.neighbors = neighbors;
  }
  return view;
}
