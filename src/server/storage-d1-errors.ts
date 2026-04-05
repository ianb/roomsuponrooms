import type { D1Database } from "./d1-types.js";
import type { ErrorLogRecord } from "./storage.js";

export async function logError(db: D1Database, entry: ErrorLogRecord): Promise<void> {
  await db
    .prepare(
      `INSERT INTO error_log (timestamp, source, message, stack, context, user_id, game_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entry.timestamp,
      entry.source,
      entry.message,
      entry.stack || null,
      entry.context || null,
      entry.userId || null,
      entry.gameId || null,
    )
    .run();
  // Prune entries older than 2 days (~10% of writes)
  if (Math.random() < 0.1) {
    const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await db.prepare("DELETE FROM error_log WHERE timestamp < ?").bind(cutoff).run();
  }
}
