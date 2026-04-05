import type { UserRecord, UserSessionSummary } from "./storage.js";
import type { D1Database, UserRow } from "./d1-types.js";
import { userRowToRecord } from "./d1-types.js";

export async function listUsers(db: D1Database): Promise<UserRecord[]> {
  const result = await db.prepare("SELECT * FROM users ORDER BY last_login_at DESC").all<UserRow>();
  return result.results.map((row) => userRowToRecord(row));
}

export async function listUserSessions(db: D1Database): Promise<UserSessionSummary[]> {
  const result = await db
    .prepare(
      `SELECT user_id, game_id, COUNT(*) as event_count, MAX(timestamp) as last_activity
       FROM events GROUP BY user_id, game_id`,
    )
    .all<{ user_id: string; game_id: string; event_count: number; last_activity: string }>();
  return result.results.map((row) => ({
    userId: row.user_id,
    gameId: row.game_id,
    eventCount: row.event_count,
    lastActivity: row.last_activity,
  }));
}

export async function listAiUsageByUser(
  db: D1Database,
): Promise<Array<{ userId: string; total: number }>> {
  const result = await db
    .prepare("SELECT user_id, COUNT(*) as total FROM ai_usage GROUP BY user_id")
    .all<{ user_id: string; total: number }>();
  return result.results.map((row) => ({ userId: row.user_id, total: row.total }));
}

export async function recordAiUsage(
  db: D1Database,
  usage: { userId: string; callType: string },
): Promise<void> {
  await db
    .prepare("INSERT INTO ai_usage (user_id, call_type, created_at) VALUES (?, ?, ?)")
    .bind(usage.userId, usage.callType, new Date().toISOString())
    .run();
}

export async function countAiUsage(
  db: D1Database,
  query: { userId: string; since: string },
): Promise<number> {
  const result = await db
    .prepare("SELECT COUNT(*) as cnt FROM ai_usage WHERE user_id = ? AND created_at > ?")
    .bind(query.userId, query.since)
    .first<number>("cnt");
  return result || 0;
}
