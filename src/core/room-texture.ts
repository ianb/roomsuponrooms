import type { EntityStore } from "./entity.js";
import type { RoomTexture } from "./entity-types.js";

/**
 * Texture = how generous the runtime AI should be in a room: "sparse" rooms
 * are connective tissue (mundane scenery, no inspection chains, fallbacks
 * lean refusal), "plain" is modest, "rich" rewards deep digging.
 *
 * An explicitly authored room.texture always wins. When unset, the texture
 * is DERIVED deterministically in the spirit of low-frequency value noise,
 * but over the room graph instead of a grid: each room hashes its id to a
 * base value, blends in its neighbors' hashes (so adjacent rooms correlate
 * and the world gets coherent quiet stretches and busy pockets, not salt-
 * and-pepper randomness), and nudges by authored content (a room full of
 * NPCs and items is presumably meant to be lively; an empty pass-through
 * is presumably meant to be quiet). The blended value is re-expanded to
 * counter averaging shrinkage, then thresholded.
 *
 * Deterministic by construction: same world graph → same textures across
 * restarts. Adding distant rooms doesn't change a room's texture; adding a
 * direct neighbor can shift it, which is acceptable — the neighborhood
 * genuinely changed.
 */

/** Threshold tuning (empirical, see test): ~43% sparse, ~45% plain, ~12% rich. */
const SPARSE_BELOW = 0.45;
const RICH_AT_OR_ABOVE = 0.78;
/** How much of the value comes from the room itself vs. its neighbors. */
const SELF_WEIGHT = 0.55;

export function resolveRoomTexture(store: EntityStore, roomId: string): RoomTexture {
  if (!store.has(roomId)) return "plain";
  const room = store.get(roomId);
  if (room.room && room.room.texture) return room.room.texture;
  return deriveTexture(store, roomId);
}

/**
 * FNV-1a hash with a murmur3 finalizer, mapped to [0, 1). The finalizer
 * matters: bare FNV-1a produces heavily correlated values for near-identical
 * strings (room:a vs room:b), which made "blending with neighbors" a no-op
 * and the texture distribution lumpy.
 */
function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

function deriveTexture(store: EntityStore, roomId: string): RoomTexture {
  const own = hash01(roomId);
  const neighborIds = store
    .getExits(roomId)
    .map((e) => (e.exit && e.exit.destination) || null)
    .filter((d): d is string => d !== null && store.has(d))
    .toSorted();

  let value: number;
  if (neighborIds.length === 0) {
    value = own;
  } else {
    const neighborAvg =
      neighborIds.map((id) => hash01(id)).reduce((a, b) => a + b, 0) / neighborIds.length;
    const blended = SELF_WEIGHT * own + (1 - SELF_WEIGHT) * neighborAvg;
    // Averaging uniforms shrinks the spread toward 0.5, which would push
    // everything into "plain". Partially re-expand (square root of the
    // analytic shrink ratio — full re-expansion overshoots the tails on
    // non-normal blends; the exponent was tuned empirically, see test).
    const shrink = Math.sqrt(
      SELF_WEIGHT ** 2 + (1 - SELF_WEIGHT) ** 2 / Math.max(1, neighborIds.length),
    );
    value = 0.5 + (blended - 0.5) / Math.sqrt(shrink);
  }

  value += contentBias(store, roomId);

  if (value < SPARSE_BELOW) {
    // Floor: a room staffed by an NPC is by definition not connective
    // tissue, whatever the noise says.
    return hasNpc(store, roomId) ? "plain" : "sparse";
  }
  if (value < RICH_AT_OR_ABOVE) return "plain";
  return "rich";
}

function hasNpc(store: EntityStore, roomId: string): boolean {
  return store.getContents(roomId).some((c) => c.tags.includes("npc"));
}

/**
 * Authored content is a strong signal of intent: NPCs and clusters of items
 * mean someone meant this room to be lively; a contentless room with
 * through-traffic shape is presumably a corridor.
 */
function contentBias(store: EntityStore, roomId: string): number {
  let npcs = 0;
  let items = 0;
  let exits = 0;
  for (const child of store.getContents(roomId)) {
    if (child.tags.includes("exit")) exits += 1;
    else if (child.tags.includes("npc")) npcs += 1;
    else if (!child.tags.includes("player")) items += 1;
  }
  const room = store.get(roomId);
  const sceneryCount = room.scenery ? room.scenery.length : 0;
  let bias = npcs * 0.08 + items * 0.02 + sceneryCount * 0.02;
  if (npcs === 0 && items === 0 && sceneryCount === 0 && exits >= 2) {
    // Pure pass-through shape: nudge toward connective tissue.
    bias -= 0.1;
  }
  // The bias TILTS the noise, it must not override it — an authored POI
  // gets a thumb on the scale toward rich, not a guarantee.
  return Math.min(0.12, bias);
}

/** One-line guidance per texture, shared by the AI fallback prompts. */
export function describeTexture(texture: RoomTexture): string {
  if (texture === "sparse") {
    return (
      "This room is SPARSE — connective tissue, not a destination. Closer inspection finds " +
      "ordinary, unremarkable things; curiosity here is politely disappointed."
    );
  }
  if (texture === "rich") {
    return (
      "This room is RICH — a place that rewards digging. Details open onto further details; " +
      "curiosity here pays off."
    );
  }
  return (
    "This room is PLAIN — moderately interesting. A detail or two repays a look, but it does " +
    "not open endless depths."
  );
}
