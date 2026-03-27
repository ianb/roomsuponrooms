import type { EntityStore, Entity } from "./entity.js";
import type { ParsedCommand, ResolvedCommand } from "./verb-types.js";

class AmbiguousObjectError extends Error {
  public readonly objectName: string;
  public readonly matches: Entity[];
  constructor(objectName: string, matches: Entity[]) {
    super(`Ambiguous object: "${objectName}"`);
    this.name = "AmbiguousObjectError";
    this.objectName = objectName;
    this.matches = matches;
  }
}

function findVisibleEntities(
  store: EntityStore,
  { roomId, playerId }: { roomId: string; playerId: string },
): Entity[] {
  const inRoom = store.getContentsDeep(roomId);
  const seen = new Set(inRoom.map((e) => e.id));
  // Add carried items that aren't already found via room (e.g., player is outside the room)
  const carried = store.getContentsDeep(playerId);
  const result = [...inRoom];
  for (const entity of carried) {
    if (!seen.has(entity.id)) {
      result.push(entity);
    }
  }
  return result;
}

function getEntityNames(entity: Entity): string[] {
  const names: string[] = [];
  const primary = (entity.properties["name"] as string) || "";
  if (primary) names.push(primary);
  const aliases = entity.properties["aliases"] as string[] | undefined;
  if (aliases) {
    names.push(...aliases);
  }
  return names;
}

function matchEntityByName(
  name: string,
  candidates: Entity[],
): Entity | AmbiguousObjectError | null {
  const lower = name.toLowerCase();
  const exact: Entity[] = [];
  const partial: Entity[] = [];

  for (const entity of candidates) {
    const names = getEntityNames(entity);
    let exactMatch = false;
    let partialMatch = false;
    for (const n of names) {
      const nLower = n.toLowerCase();
      if (nLower === lower) {
        exactMatch = true;
        break;
      }
      if (nLower.includes(lower)) {
        partialMatch = true;
      }
    }
    if (exactMatch) {
      exact.push(entity);
    } else if (partialMatch) {
      partial.push(entity);
    }
  }

  if (exact.length === 1) return exact[0] || null;
  if (exact.length > 1) return new AmbiguousObjectError(name, exact);
  if (partial.length === 1) return partial[0] || null;
  if (partial.length > 1) return new AmbiguousObjectError(name, partial);
  return null;
}

/** When multiple entities match, prefer one the player is carrying */
function preferHeld(matches: Entity[], playerId: string): Entity | null {
  const held = matches.filter((e) => e.properties["location"] === playerId);
  if (held.length === 1) return held[0]!;
  return null;
}

function resolveObject(
  name: string,
  { visible, playerId }: { visible: Entity[]; playerId: string },
): Entity | string {
  const result = matchEntityByName(name, visible);
  if (result instanceof AmbiguousObjectError) {
    const held = preferHeld(result.matches, playerId);
    if (held) return held;
    const names = result.matches.map((m) => (m.properties["name"] as string) || m.id);
    return `Which "${name}" do you mean? ${names.join(", ")}`;
  }
  if (!result) return `{!You don't see "${name}" here.!}`;
  return result;
}

export function resolveCommand(
  parsed: ParsedCommand,
  { store, roomId, playerId }: { store: EntityStore; roomId: string; playerId: string },
): ResolvedCommand | string {
  if (parsed.form === "intransitive") {
    return { form: "intransitive", verb: parsed.verb };
  }

  const visible = findVisibleEntities(store, { roomId, playerId });
  const ctx = { visible, playerId };

  if (parsed.form === "transitive") {
    const obj = resolveObject(parsed.object, ctx);
    if (typeof obj === "string") return obj;
    return { form: "transitive", verb: parsed.verb, object: obj };
  }

  if (parsed.form === "prepositional") {
    const obj = resolveObject(parsed.object, ctx);
    if (typeof obj === "string") return obj;
    return { form: "prepositional", verb: parsed.verb, prep: parsed.prep, object: obj };
  }

  // ditransitive
  const obj = resolveObject(parsed.object, ctx);
  if (typeof obj === "string") return obj;
  const indirect = resolveObject(parsed.indirect, ctx);
  if (typeof indirect === "string") return indirect;
  return {
    form: "ditransitive",
    verb: parsed.verb,
    object: obj,
    prep: parsed.prep,
    indirect: indirect,
  };
}
