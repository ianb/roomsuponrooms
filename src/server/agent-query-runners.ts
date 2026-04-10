import type { EntityStore } from "../core/entity.js";
import type { ToolContext } from "./agent-tool-context.js";
import { buildGetView, entityToView, handlerPatternView } from "./agent-query-views.js";
import type { EntityView } from "./agent-query-views.js";

export class EntityNotFoundError extends Error {
  override name = "EntityNotFoundError";
  constructor(public readonly id: string) {
    super("Entity not found");
  }
}

// --- get ---

/**
 * Fetch entities by id. The id is a glob pattern: `*` matches any sequence of
 * characters. If the pattern contains no wildcards, returns a single GetView
 * (or throws EntityNotFoundError). If it contains at least one `*`, returns
 * an array of matching GetViews (possibly empty).
 *
 * Examples:
 *   get({id: "item:lever"})           → single GetView
 *   get({id: "room:*"})               → array of all rooms
 *   get({id: "exit:gate:*"})          → array of all exits leaving gate
 *   get({id: "*"})                    → array of every entity in the world
 */
export function runGet(
  context: ToolContext,
  args: {
    id: string;
    withChildren?: boolean;
    withNeighborhood?: boolean;
    depth?: number;
  },
): unknown {
  const flags = {
    withChildren: args.withChildren === true,
    withNeighborhood: args.withNeighborhood === true,
    depth: args.depth || 1,
  };
  if (args.id.includes("*")) {
    const matcher = globToRegex(args.id);
    const matches: unknown[] = [];
    for (const entity of collectAllEntities(context.store)) {
      if (!matcher.test(entity.id)) continue;
      const view = buildGetView(context.store, { id: entity.id, ...flags });
      if (view) matches.push(view);
    }
    return matches;
  }
  const view = buildGetView(context.store, { id: args.id, ...flags });
  if (!view) throw new EntityNotFoundError(args.id);
  return view;
}

function globToRegex(glob: string): RegExp {
  // Escape regex special chars EXCEPT `*`, then turn `*` into `.*`. Anchor.
  // The replacement leaves only escaped literal characters and `.*`, so the
  // resulting RegExp source is safe to construct from the agent's input.
  const escaped = glob.replace(/[$()+.?[\\\]^{|}]/g, "\\$&").replace(/\*/g, ".*");
  // eslint-disable-next-line security/detect-non-literal-regexp
  return new RegExp(`^${escaped}$`);
}

// --- entities ---

export function runEntities(context: ToolContext): unknown {
  return collectAllEntities(context.store).map((e) => entityToView(context.store, e));
}

function collectAllEntities(store: EntityStore): ReturnType<EntityStore["findByTag"]> {
  // EntityStore doesn't expose an "all entities" iterator, so we walk the
  // location graph from rooms outward, then add anything else we can reach
  // via tag indices we've already discovered. For typical games (rooms +
  // their contents) this catches everything.
  const visited = new Set<string>();
  const collected: ReturnType<EntityStore["findByTag"]> = [];
  const stack = store.findByTag("room").map((r) => r.id);
  // Also seed with player and any other top-level tags we know about.
  for (const tagSeed of ["player", "world"]) {
    for (const e of store.findByTag(tagSeed)) {
      if (!stack.includes(e.id)) stack.push(e.id);
    }
  }
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (!store.has(id)) continue;
    const entity = store.get(id);
    collected.push(entity);
    for (const child of store.getContents(id)) {
      if (!visited.has(child.id)) stack.push(child.id);
    }
  }
  return collected;
}

// --- handlers ---

export function runHandlers(context: ToolContext): unknown {
  return context.verbs.list().map(handlerPatternView);
}

// --- events ---

export async function runEvents(context: ToolContext): Promise<unknown> {
  const entries = await context.storage.loadEvents({
    gameId: context.gameId,
    userId: context.userId,
  });
  return entries.map((entry, i) => ({
    offset: entries.length - i - 1, // 0 = most recent
    command: entry.command,
    timestamp: entry.timestamp,
    changes: entry.events.map((e) => ({
      type: e.type,
      entityId: e.entityId,
      property: e.property,
      value: e.value,
      description: e.description,
    })),
  }));
}

// --- contains postprocess ---

/**
 * Filter a result by case-insensitive substring against the JSON-stringified
 * form. For arrays, returns a new array of matching elements. For objects,
 * returns the object if its JSON contains the needle, else null.
 */
export function applyContainsFilter(value: unknown, needle: string): unknown {
  const lowerNeedle = needle.toLowerCase();
  if (Array.isArray(value)) {
    return value.filter((item) => JSON.stringify(item).toLowerCase().includes(lowerNeedle));
  }
  if (value !== null && typeof value === "object") {
    return JSON.stringify(value).toLowerCase().includes(lowerNeedle) ? value : null;
  }
  return String(value).toLowerCase().includes(lowerNeedle) ? value : null;
}

// Re-export EntityView for callers that want the type.
export type { EntityView };
