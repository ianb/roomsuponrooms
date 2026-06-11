import type { SessionKey } from "./storage.js";

/**
 * Per-isolate tracker of how many event-log entries each session has, as
 * far as THIS isolate knows. Storage implementations keep it in sync on
 * append/clear/pop, and initGame records the count it replayed.
 *
 * Why: Cloudflare can run many Worker isolates concurrently, each with its
 * own in-memory game-instance cache. A command served by one isolate appends
 * events the others never see, so their cached instances silently diverge
 * (a player examines a room they already left). Comparing this local count
 * against the database on every cache hit detects foreign writes and forces
 * a rebuild. See getOrCreateGame in router.ts.
 */
const counts = new Map<string, number>();

function countKey(session: SessionKey): string {
  return `${session.gameId}:${session.userId}`;
}

export function setKnownEventCount(session: SessionKey, count: number): void {
  counts.set(countKey(session), count);
}

/** No-op when the count was never initialized — unknown stays unknown. */
export function bumpKnownEventCount(session: SessionKey): void {
  const key = countKey(session);
  const current = counts.get(key);
  if (current !== undefined) counts.set(key, current + 1);
}

/** No-op when the count was never initialized — unknown stays unknown. */
export function decrementKnownEventCount(session: SessionKey): void {
  const key = countKey(session);
  const current = counts.get(key);
  if (current !== undefined) counts.set(key, Math.max(0, current - 1));
}

/** Null means this isolate has not built a world for the session yet. */
export function getKnownEventCount(session: SessionKey): number | null {
  const value = counts.get(countKey(session));
  return value === undefined ? null : value;
}
