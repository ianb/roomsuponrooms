import { getStorage } from "./storage-instance.js";

export interface ErrorLogEntry {
  source: string;
  message: string;
  stack?: string;
  context?: string;
  userId?: string;
  gameId?: string;
}

/** Log an error to persistent storage (D1 in prod, console in dev) */
export function logError(entry: ErrorLogEntry): void {
  const timestamp = new Date().toISOString();
  console.error(`[${entry.source}] ${entry.message}`);
  if (entry.stack) console.error(entry.stack);

  // Fire-and-forget — don't let logging failures propagate
  const storage = getStorage();
  if (storage.logError) {
    storage.logError({ ...entry, timestamp }).catch((err: unknown) => {
      console.error("[error-log] Failed to persist error:", err);
    });
  }
}

/** Log an Error object with context */
export function logErrorObj(
  source: string,
  opts: { error: unknown; userId?: string; gameId?: string; context?: string },
): void {
  const err = opts.error instanceof Error ? opts.error : new Error(String(opts.error));
  logError({
    source,
    message: err.message,
    stack: err.stack,
    context: opts.context,
    userId: opts.userId,
    gameId: opts.gameId,
  });
}
