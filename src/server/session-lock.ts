import type { SessionKey } from "./storage.js";

/**
 * Serialize command execution per (game, user). Commands mutate the cached
 * GameInstance, so two in-flight commands from the same user would interleave
 * store mutations and event-log appends, corrupting state. Each call runs
 * after the previous call for the same session settles; different sessions
 * never block each other.
 */
const queues: Map<string, Promise<void>> = new Map();

export async function withSessionLock<T>(session: SessionKey, fn: () => Promise<T>): Promise<T> {
  const key = `${session.gameId}:${session.userId}`;
  const prev = queues.get(key) || Promise.resolve();
  const run = prev.then(fn);
  // Track settlement (success or failure) so the next caller queues behind
  // this one without inheriting its rejection.
  const settled = run.then(
    () => {},
    () => {},
  );
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return run;
}
