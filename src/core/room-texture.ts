import type { EntityStore } from "./entity.js";
import type { RoomTexture } from "./entity-types.js";

/**
 * Texture = how generous the runtime AI should be in a room: "sparse" rooms
 * are connective tissue (mundane scenery, no inspection chains, fallbacks
 * lean refusal), "plain" is modest, "rich" rewards deep digging.
 *
 * An explicitly authored room.texture always wins. When unset, texture is
 * DERIVED deterministically from THREE octaves of graph noise, so balance is
 * fractal — it exists at every scale, with extremes in places:
 *
 *  - District tone (largest): each room belongs to a district — its region
 *    entity if the game has one, else a minimizer anchor (the room with the
 *    locally smallest hash within MINIMIZER_RADIUS hops; neighbors provably
 *    share anchors, so districts are contiguous). The district hash runs
 *    through a fat-tailed contrast curve: ~74% of districts sit near the
 *    middle (balanced), ~13% collapse to near-zero (abandoned quarters),
 *    ~13% blow out high (oppressively dense pockets).
 *  - Neighborhood (middle): the room's hash blended with direct neighbors,
 *    re-expanded — local runs and variation within a district.
 *  - Room (finest): the room's own hash — so even an abandoned quarter has
 *    the odd room with something in it.
 *
 * Content nudges the result (NPCs/items tilt richer, capped) and NPC-staffed
 * rooms floor at "plain". Deterministic by construction: same world graph →
 * same textures across restarts.
 *
 * Constants are empirically tuned (see test/room-texture.test.ts): on a
 * 600-room ring, ~40% sparse / 47% plain / 13% rich globally, with ~20% of
 * 10-room windows reading as extreme (abandoned or dense) and the rest near
 * the global mix. Hard-won details: hashes need a murmur finalizer (bare
 * FNV-1a correlates on similar ids); the district anchor must be min-by-HASH,
 * not min-by-id (monotonic ids make min-by-id degenerate to per-room
 * districts); variance re-expansion uses the square root of the analytic
 * shrink ratio.
 */

const SPARSE_BELOW = 0.45;
const RICH_AT_OR_ABOVE = 0.68;
const TONE_WEIGHT = 0.6;
const MEDIUM_WEIGHT = 0.25;
const OWN_WEIGHT = 0.15;
const SELF_WEIGHT = 0.55;
const MINIMIZER_RADIUS = 3;

export function resolveRoomTexture(store: EntityStore, roomId: string): RoomTexture {
  if (!store.has(roomId)) return "plain";
  const room = store.get(roomId);
  if (room.room && room.room.texture) return room.room.texture;
  return deriveTexture(store, roomId);
}

export interface AreaTone {
  /** Raw tone value in roughly [0, 1.1]. */
  value: number;
  label: "abandoned" | "quiet" | "balanced" | "busy" | "dense";
}

/**
 * The district-scale tone for the area around a room. Exposed so prompts
 * can let an extreme district read as what it is — a whole abandoned
 * quarter should FEEL abandoned in every improvised detail.
 */
export function resolveAreaTone(store: EntityStore, roomId: string): AreaTone {
  const anchorId = districtAnchor(store, roomId);
  const value = toneCurve(hash01(`tone:${anchorId}`));
  return { value, label: toneLabel(value) };
}

function toneLabel(value: number): AreaTone["label"] {
  if (value < 0.2) return "abandoned";
  if (value < 0.38) return "quiet";
  if (value <= 0.62) return "balanced";
  if (value <= 0.85) return "busy";
  return "dense";
}

/** FNV-1a with a murmur3 finalizer, mapped to [0, 1). */
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

/**
 * Fat-tailed contrast curve over a uniform input: most districts land in a
 * tight band around the middle, but the tails are sent to extremes. This is
 * where "mostly balanced, extreme in places" comes from.
 */
function toneCurve(u: number): number {
  if (u < 0.13) return 0.02 + (u / 0.13) * 0.16; // abandoned: 0.02..0.18
  if (u > 0.87) return 0.92 + ((u - 0.87) / 0.13) * 0.18; // dense: 0.92..1.10
  return 0.38 + ((u - 0.13) / 0.74) * 0.24; // balanced: 0.38..0.62
}

/**
 * The district a room belongs to: its region entity when the game nests
 * rooms in regions (authored districts win), else the minimizer anchor —
 * the room id with the smallest hash among all rooms within
 * MINIMIZER_RADIUS hops, including this one.
 */
function districtAnchor(store: EntityStore, roomId: string): string {
  const room = store.get(roomId);
  if (room.location && store.has(room.location)) {
    const parent = store.get(room.location);
    if (parent.tags.includes("region")) return parent.id;
  }
  let best = roomId;
  let bestHash = hash01(roomId);
  for (const id of roomsWithin(store, { roomId, hops: MINIMIZER_RADIUS })) {
    const h = hash01(id);
    if (h < bestHash) {
      best = id;
      bestHash = h;
    }
  }
  return best;
}

function roomsWithin(
  store: EntityStore,
  { roomId, hops }: { roomId: string; hops: number },
): string[] {
  const seen = new Set<string>([roomId]);
  let frontier = [roomId];
  for (let hop = 0; hop < hops; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const exit of store.getExits(id)) {
        const dest = exit.exit && exit.exit.destination;
        if (!dest || seen.has(dest) || !store.has(dest)) continue;
        seen.add(dest);
        next.push(dest);
      }
    }
    frontier = next;
  }
  return [...seen];
}

function deriveTexture(store: EntityStore, roomId: string): RoomTexture {
  const tone = resolveAreaTone(store, roomId).value;
  const own = hash01(roomId);
  const medium = neighborhoodValue(store, { roomId, own });
  let value = TONE_WEIGHT * tone + MEDIUM_WEIGHT * medium + OWN_WEIGHT * own;
  value += contentBias(store, { roomId, tone });

  if (value < SPARSE_BELOW) {
    // Floor: a room staffed by an NPC is by definition not connective
    // tissue, whatever the noise says.
    return hasNpc(store, roomId) ? "plain" : "sparse";
  }
  if (value < RICH_AT_OR_ABOVE) return "plain";
  return "rich";
}

function neighborhoodValue(
  store: EntityStore,
  { roomId, own }: { roomId: string; own: number },
): number {
  const neighborIds = store
    .getExits(roomId)
    .map((e) => (e.exit && e.exit.destination) || null)
    .filter((d): d is string => d !== null && store.has(d))
    .toSorted();
  if (neighborIds.length === 0) return own;
  const neighborAvg =
    neighborIds.map((id) => hash01(id)).reduce((a, b) => a + b, 0) / neighborIds.length;
  const blended = SELF_WEIGHT * own + (1 - SELF_WEIGHT) * neighborAvg;
  const shrink = Math.sqrt(
    SELF_WEIGHT ** 2 + (1 - SELF_WEIGHT) ** 2 / Math.max(1, neighborIds.length),
  );
  return 0.5 + (blended - 0.5) / Math.sqrt(shrink);
}

function hasNpc(store: EntityStore, roomId: string): boolean {
  return store.getContents(roomId).some((c) => c.tags.includes("npc"));
}

/**
 * Authored content tilts the noise — it must not override it. An authored
 * POI gets a thumb on the scale toward rich, not a guarantee.
 */
function contentBias(
  store: EntityStore,
  { roomId, tone }: { roomId: string; tone: number },
): number {
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
  if (npcs === 0 && items === 0 && sceneryCount === 0 && exits >= 2 && tone < 0.85) {
    // Pass-through shape nudges toward connective tissue — except in dense
    // districts, where even the corridors are claimed and crowded.
    bias -= 0.1;
  }
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

/**
 * One-line area-tone guidance for prompts, or null for unremarkable tones.
 * Extreme districts should READ as what they are in every improvised detail.
 */
export function describeAreaTone(tone: AreaTone): string | null {
  if (tone.label === "abandoned") {
    return (
      "The surrounding district is ABANDONED — disuse, dust, things left mid-task long ago. " +
      "Let neglect show in every detail; nothing here has been tended in a long time."
    );
  }
  if (tone.label === "dense") {
    return (
      "The surrounding district is OPPRESSIVELY DENSE — crowded, layered, every surface " +
      "claimed. Details crowd each other; there is always one more thing in the corner."
    );
  }
  if (tone.label === "quiet") {
    return "The surrounding district is quiet and lightly used — keep details low-key.";
  }
  if (tone.label === "busy") {
    return "The surrounding district is busy and well-trafficked — details show wear and use.";
  }
  return null;
}
