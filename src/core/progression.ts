import type { Entity, EntityStore } from "./entity.js";

/**
 * Progression model: per-world "tracks" (named, player-visible meters) with
 * optional named tiers, plus reactive "gates" on exits/entities that open
 * once a meter crosses a threshold.
 *
 * Design choices that keep this deterministic and replay-safe:
 *  - A meter is just a numeric player property (declared per game). It is
 *    awarded via `set-property` events (which persist on replay), NOT the
 *    legacy `score-change` event (which is display-only and does not).
 *  - Gates are REACTIVE: an exit/entity carries gate properties evaluated
 *    live against the player's meters. There is no "unlock" state to persist
 *    — the content simply becomes reachable once you qualify.
 *  - A tier-up is detected by comparing the tier index before and after a
 *    command (see tierCrossings), so no extra "recorded tier" property is
 *    needed and replays don't double-fire the ceremony.
 */

export interface Tier {
  /** Display name of this tier, e.g. "Journeyman". */
  name: string;
  /** Meter value at which this tier is reached (ascending across the ladder). */
  at: number;
  /** Optional flavor line shown when the tier is crossed; defaults to a generic line. */
  announce?: string;
}

export interface Track {
  /** Meter property name on the player, e.g. "craft". */
  name: string;
  /** Display label, e.g. "Craft". */
  label: string;
  /** Tier ladder, ascending by `at`. Continuous meters (money) may omit it. */
  tiers?: Tier[];
  /** When true, the status readout shows the next tier's requirement (a signposted goal). */
  signpostNext?: boolean;
  /** When true, omit from the status readout entirely. */
  hidden?: boolean;
}

/** The player's current value for a meter (0 when unset). */
export function meterValue(player: Entity, trackName: string): number {
  const v = player.properties[trackName];
  return typeof v === "number" ? v : 0;
}

export interface GateState {
  /** Whether the entity carries a gate at all. */
  gated: boolean;
  /** Whether the player currently meets the gate. */
  passes: boolean;
  /** Whether a failed gate should hide the entity entirely (vs. show-but-block). */
  hidden: boolean;
  /** In-character message shown when a visible gate blocks the player. */
  message: string | null;
}

const OPEN: GateState = { gated: false, passes: true, hidden: false, message: null };

/**
 * Evaluate any entity's gate against the player. Gate properties:
 *  - gateTrack   (string)  meter to test
 *  - gateAtLeast (number)  threshold; default 0
 *  - gateHidden  (boolean) hide entirely when failing; default false
 *  - gateMessage (string)  signpost shown when a visible gate blocks
 */
export function gateState(entity: Entity, player: Entity): GateState {
  const track = entity.properties.gateTrack;
  if (typeof track !== "string" || track.length === 0) return OPEN;
  const atLeast =
    typeof entity.properties.gateAtLeast === "number" ? entity.properties.gateAtLeast : 0;
  const passes = meterValue(player, track) >= atLeast;
  const hidden = entity.properties.gateHidden === true;
  const message =
    typeof entity.properties.gateMessage === "string" ? entity.properties.gateMessage : null;
  return { gated: true, passes, hidden, message };
}

/** Index of the highest tier reached at `value`, or -1 if below the first tier. */
export function tierIndex(track: Track, value: number): number {
  if (!track.tiers || track.tiers.length === 0) return -1;
  let idx = -1;
  for (let i = 0; i < track.tiers.length; i++) {
    if (value >= track.tiers[i]!.at) idx = i;
  }
  return idx;
}

/** Snapshot every track's current meter value — taken before a command runs. */
export function trackSnapshot(player: Entity, tracks: Track[]): Map<string, number> {
  const snap = new Map<string, number>();
  for (const track of tracks) snap.set(track.name, meterValue(player, track.name));
  return snap;
}

/**
 * Ceremony lines for any tiers crossed between the pre-command snapshot and
 * the current player state. One line per tier crossed (a single command can
 * vault more than one tier at once).
 */
export function tierCrossings(
  store: EntityStore,
  { tracks, before, playerId }: { tracks: Track[]; before: Map<string, number>; playerId: string },
): string[] {
  if (!store.has(playerId)) return [];
  const player = store.get(playerId);
  const lines: string[] = [];
  for (const track of tracks) {
    if (!track.tiers || track.tiers.length === 0) continue;
    const was = tierIndex(track, before.get(track.name) || 0);
    const now = tierIndex(track, meterValue(player, track.name));
    for (let i = was + 1; i <= now; i++) {
      const tier = track.tiers[i]!;
      lines.push(tier.announce ? tier.announce : `*** You are now ${tier.name}. ***`);
    }
  }
  return lines;
}

/**
 * Authoring-facing summary of a world's tracks, for the editing agent's
 * system prompt. Lists each track's meter name and tier ladder so the agent
 * knows which meters it may award and gate against.
 */
export function describeTracksForAuthoring(tracks: Track[] | undefined): string {
  if (!tracks || tracks.length === 0) {
    return "This world declares no progression tracks. Do not award or gate against any meter unless you first add a track to the game config.";
  }
  const lines = tracks.map((track) => {
    if (!track.tiers || track.tiers.length === 0) {
      return `- "${track.name}" (${track.label}): continuous meter, no tiers.`;
    }
    const ladder = track.tiers.map((t) => `${t.name} at ${t.at}`).join(", ");
    return `- "${track.name}" (${track.label}): ${ladder}.`;
  });
  return lines.join("\n");
}

/** Player-facing status readout: each visible track, its value, current tier, signposted next. */
export function describeStatus(
  store: EntityStore,
  { tracks, playerId }: { tracks: Track[]; playerId: string },
): string {
  if (tracks.length === 0) return "You have no standing to speak of yet.";
  if (!store.has(playerId)) return "You have no standing to speak of yet.";
  const player = store.get(playerId);
  const lines: string[] = [];
  for (const track of tracks) {
    if (track.hidden) continue;
    const value = meterValue(player, track.name);
    if (!track.tiers || track.tiers.length === 0) {
      lines.push(`${track.label}: ${value}`);
      continue;
    }
    const idx = tierIndex(track, value);
    const current = idx >= 0 ? track.tiers[idx]!.name : "unranked";
    let line = `${track.label}: ${current}`;
    if (track.signpostNext && idx + 1 < track.tiers.length) {
      const next = track.tiers[idx + 1]!;
      line += ` (${next.name} at ${next.at}; you have ${value})`;
    }
    lines.push(line);
  }
  return lines.length > 0 ? lines.join("\n") : "You have no standing to speak of yet.";
}
