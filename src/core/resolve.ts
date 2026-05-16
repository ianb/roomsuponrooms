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
  if (entity.name) names.push(entity.name);
  if (entity.aliases.length > 0) {
    names.push(...entity.aliases);
  }
  return names;
}

/**
 * Word-tier match. The input matches at this tier if some name/alias is
 * either equal to the input OR contains the input as a whitespace-bounded
 * word (or sequence of words) inside the name. We deliberately use
 * WHITESPACE — not all non-word characters — because entity ids and exit
 * names are kebab/colon-cased ("exit:outside-grate:north") and we don't
 * want internal id structure to manufacture false matches against display
 * names. A real human-readable name like "rusty lever" still matches "lever"
 * because the space is a word boundary.
 */
function namesContainAsWord(names: string[], lower: string): boolean {
  for (const n of names) {
    const haystack = n.toLowerCase();
    if (haystack === lower) return true;
    let from = 0;
    while (from <= haystack.length - lower.length) {
      const idx = haystack.indexOf(lower, from);
      if (idx === -1) break;
      const beforeOk = idx === 0 || isSpace(haystack.codePointAt(idx - 1));
      const after = idx + lower.length;
      const afterOk = after === haystack.length || isSpace(haystack.codePointAt(after));
      if (beforeOk && afterOk) return true;
      from = idx + 1;
    }
  }
  return false;
}

function isSpace(code: number | undefined): boolean {
  if (code === undefined) return false;
  // ASCII space, tab, newline, carriage return.
  return code === 32 || code === 9 || code === 10 || code === 13;
}

interface MatchTier {
  /** Exact name/alias match, or whitespace-bounded word match. */
  word: Entity[];
  /** Matched only as a substring (e.g. inside a longer word or an internal id). */
  substring: Entity[];
}

function matchEntityByName(
  name: string,
  candidates: Entity[],
): Entity | AmbiguousObjectError | null {
  const lower = name.toLowerCase().trim();
  const tiers: MatchTier = { word: [], substring: [] };

  for (const entity of candidates) {
    const names = getEntityNames(entity);
    if (namesContainAsWord(names, lower)) {
      tiers.word.push(entity);
      continue;
    }
    if (names.some((n) => n.toLowerCase().includes(lower))) {
      tiers.substring.push(entity);
    }
  }

  if (tiers.word.length === 1) return tiers.word[0] || null;
  if (tiers.word.length > 1) return new AmbiguousObjectError(name, tiers.word);
  if (tiers.substring.length === 1) return tiers.substring[0] || null;
  if (tiers.substring.length > 1) return new AmbiguousObjectError(name, tiers.substring);
  return null;
}

/**
 * When multiple entities match, prefer one the player is carrying — but only
 * when each candidate has the input as an *exact* name or alias (the strongest
 * possible signal). For looser matches (input is a word inside a longer name),
 * we deliberately leave the ambiguity unresolved so that bad aliases or naming
 * collisions surface as errors instead of being papered over.
 */
function preferHeld(
  matches: Entity[],
  { name, playerId }: { name: string; playerId: string },
): Entity | null {
  const lower = name.toLowerCase().trim();
  const allExact = matches.every((e) => getEntityNames(e).some((n) => n.toLowerCase() === lower));
  if (!allExact) return null;
  const held = matches.filter((e) => e.location === playerId);
  if (held.length === 1) return held[0]!;
  return null;
}

const SELF_WORDS = new Set(["self", "myself", "me", "yourself"]);

function resolveObject(
  name: string,
  { visible, playerId }: { visible: Entity[]; playerId: string },
): Entity | string {
  if (SELF_WORDS.has(name.toLowerCase())) {
    const player = visible.find((e) => e.id === playerId);
    if (player) return player;
  }
  const result = matchEntityByName(name, visible);
  if (result instanceof AmbiguousObjectError) {
    const held = preferHeld(result.matches, { name, playerId });
    if (held) return held;
    const labels = result.matches.map((m) => m.name);
    return `{!Which "${name}" do you mean? ${labels.join(", ")}!}`;
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
