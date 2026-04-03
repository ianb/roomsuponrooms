import type { BugReport, BugReportUpdate, BugReportStatus } from "./storage.js";
import type { D1Database, BugReportRow } from "./d1-types.js";

function bugRowToReport(row: BugReportRow): BugReport {
  return {
    id: row.id,
    gameId: row.game_id,
    userId: row.user_id,
    userName: row.user_name,
    description: row.description,
    roomId: row.room_id,
    roomName: row.room_name,
    recentCommands: JSON.parse(row.recent_commands),
    entityChanges: row.entity_changes ? JSON.parse(row.entity_changes) : [],
    status: row.status as BugReportStatus,
    fixCommit: row.fix_commit,
    duplicateOf: row.duplicate_of,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function saveBugReport(db: D1Database, report: BugReport): Promise<void> {
  await db
    .prepare(
      `INSERT INTO bug_reports
       (id, game_id, user_id, user_name, description, room_id, room_name,
        recent_commands, entity_changes, status, fix_commit, duplicate_of,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      report.id,
      report.gameId,
      report.userId,
      report.userName,
      report.description,
      report.roomId,
      report.roomName,
      JSON.stringify(report.recentCommands),
      JSON.stringify(report.entityChanges),
      report.status,
      report.fixCommit,
      report.duplicateOf,
      report.createdAt,
      report.updatedAt,
    )
    .run();
}

export async function listBugReports(
  db: D1Database,
  opts?: { status?: string; gameId?: string },
): Promise<BugReport[]> {
  let sql = "SELECT * FROM bug_reports";
  const conditions: string[] = [];
  const binds: string[] = [];
  if (opts && opts.status) {
    conditions.push("status = ?");
    binds.push(opts.status);
  }
  if (opts && opts.gameId) {
    conditions.push("game_id = ?");
    binds.push(opts.gameId);
  }
  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }
  sql += " ORDER BY created_at DESC";
  const stmt = db.prepare(sql);
  const bound = binds.length > 0 ? stmt.bind(...binds) : stmt;
  const result = await bound.all<BugReportRow>();
  return result.results.map((row) => bugRowToReport(row));
}

export async function getBugReport(db: D1Database, id: string): Promise<BugReport | null> {
  const row = await db
    .prepare("SELECT * FROM bug_reports WHERE id = ?")
    .bind(id)
    .first<BugReportRow>();
  return row ? bugRowToReport(row) : null;
}

export async function updateBugReport(
  db: D1Database,
  { id, update }: { id: string; update: BugReportUpdate },
): Promise<void> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (update.status !== undefined) {
    sets.push("status = ?");
    binds.push(update.status);
  }
  if (update.fixCommit !== undefined) {
    sets.push("fix_commit = ?");
    binds.push(update.fixCommit);
  }
  if (update.duplicateOf !== undefined) {
    sets.push("duplicate_of = ?");
    binds.push(update.duplicateOf);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  binds.push(new Date().toISOString());
  binds.push(id);
  await db
    .prepare(`UPDATE bug_reports SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();
}
