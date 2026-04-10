import type { D1Database } from "./d1-types.js";
import type {
  AgentSessionRecord,
  AgentSessionStatus,
  WorldEditRecord,
  NewWorldEditRecord,
  WorldEditTargetKind,
  WorldEditOp,
} from "./storage.js";

export { commitSession } from "./storage-d1-agent-commit.js";

interface AgentSessionRow {
  id: string;
  game_id: string;
  user_id: string;
  request: string;
  status: string;
  messages: string;
  saved_vars: string;
  turn_count: number;
  turn_limit: number;
  summary: string | null;
  revert_of: string | null;
  model: string | null;
  input_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

interface WorldEditRow {
  seq: number;
  game_id: string;
  session_id: string;
  target_kind: string;
  target_id: string;
  op: string;
  payload: string | null;
  prior_state: string | null;
  applied: number;
  created_at: string;
}

function rowToAgentSession(row: AgentSessionRow): AgentSessionRecord {
  return {
    id: row.id,
    gameId: row.game_id,
    userId: row.user_id,
    request: row.request,
    status: row.status as AgentSessionStatus,
    messages: JSON.parse(row.messages) as unknown[],
    savedVars: JSON.parse(row.saved_vars) as Record<string, unknown>,
    turnCount: row.turn_count,
    turnLimit: row.turn_limit,
    summary: row.summary,
    revertOf: row.revert_of,
    model: row.model,
    tokenUsage: {
      inputTokens: row.input_tokens,
      cacheReadTokens: row.cache_read_tokens,
      cacheWriteTokens: row.cache_write_tokens,
      outputTokens: row.output_tokens,
      reasoningTokens: row.reasoning_tokens,
      totalTokens: row.total_tokens,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  };
}

export function rowToWorldEdit(row: WorldEditRow): WorldEditRecord {
  return {
    seq: row.seq,
    gameId: row.game_id,
    sessionId: row.session_id,
    targetKind: row.target_kind as WorldEditTargetKind,
    targetId: row.target_id,
    op: row.op as WorldEditOp,
    payload: row.payload === null ? null : (JSON.parse(row.payload) as unknown),
    priorState: row.prior_state === null ? null : (JSON.parse(row.prior_state) as unknown),
    applied: row.applied !== 0,
    createdAt: row.created_at,
  };
}

// --- Sessions ---

export async function createAgentSession(
  db: D1Database,
  record: AgentSessionRecord,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO agent_sessions
       (id, game_id, user_id, request, status, messages, saved_vars,
        turn_count, turn_limit, summary, revert_of, model,
        input_tokens, cache_read_tokens, cache_write_tokens,
        output_tokens, reasoning_tokens, total_tokens,
        created_at, updated_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      record.id,
      record.gameId,
      record.userId,
      record.request,
      record.status,
      JSON.stringify(record.messages),
      JSON.stringify(record.savedVars),
      record.turnCount,
      record.turnLimit,
      record.summary,
      record.revertOf,
      record.model,
      record.tokenUsage.inputTokens,
      record.tokenUsage.cacheReadTokens,
      record.tokenUsage.cacheWriteTokens,
      record.tokenUsage.outputTokens,
      record.tokenUsage.reasoningTokens,
      record.tokenUsage.totalTokens,
      record.createdAt,
      record.updatedAt,
      record.finishedAt,
    )
    .run();
}

export async function getAgentSession(
  db: D1Database,
  id: string,
): Promise<AgentSessionRecord | null> {
  const row = await db
    .prepare("SELECT * FROM agent_sessions WHERE id = ?")
    .bind(id)
    .first<AgentSessionRow>();
  return row ? rowToAgentSession(row) : null;
}

const SESSION_PATCH_COLUMNS: Record<string, string> = {
  status: "status",
  messages: "messages",
  savedVars: "saved_vars",
  turnCount: "turn_count",
  turnLimit: "turn_limit",
  summary: "summary",
  revertOf: "revert_of",
  model: "model",
  finishedAt: "finished_at",
};

function patchToSetClause(patch: Partial<AgentSessionRecord>): {
  clause: string;
  values: unknown[];
} {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (key === "tokenUsage" && value && typeof value === "object") {
      const usage = value as AgentSessionRecord["tokenUsage"];
      sets.push("input_tokens = ?");
      values.push(usage.inputTokens);
      sets.push("cache_read_tokens = ?");
      values.push(usage.cacheReadTokens);
      sets.push("cache_write_tokens = ?");
      values.push(usage.cacheWriteTokens);
      sets.push("output_tokens = ?");
      values.push(usage.outputTokens);
      sets.push("reasoning_tokens = ?");
      values.push(usage.reasoningTokens);
      sets.push("total_tokens = ?");
      values.push(usage.totalTokens);
      continue;
    }
    const column = SESSION_PATCH_COLUMNS[key];
    if (!column) continue;
    sets.push(`${column} = ?`);
    if (key === "messages" || key === "savedVars") {
      values.push(JSON.stringify(value));
    } else {
      values.push(value);
    }
  }
  return { clause: sets.join(", "), values };
}

export async function updateAgentSession(
  db: D1Database,
  { id, patch }: { id: string; patch: Partial<AgentSessionRecord> },
): Promise<void> {
  const { clause, values } = patchToSetClause(patch);
  if (!clause) return;
  const updatedAt = patch.updatedAt || new Date().toISOString();
  await db
    .prepare(`UPDATE agent_sessions SET ${clause}, updated_at = ? WHERE id = ?`)
    .bind(...values, updatedAt, id)
    .run();
}

export async function listAgentSessions(
  db: D1Database,
  filter?: { gameId?: string; status?: AgentSessionStatus },
): Promise<AgentSessionRecord[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filter && filter.gameId) {
    conditions.push("game_id = ?");
    values.push(filter.gameId);
  }
  if (filter && filter.status) {
    conditions.push("status = ?");
    values.push(filter.status);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM agent_sessions ${where} ORDER BY created_at DESC`;
  const result = await db
    .prepare(sql)
    .bind(...values)
    .all<AgentSessionRow>();
  return result.results.map(rowToAgentSession);
}

// --- World edits ---

class AppendWorldEditFailedError extends Error {
  override name = "AppendWorldEditFailedError";
  constructor() {
    super("Failed to append world edit (no seq returned)");
  }
}

export async function appendWorldEdit(
  db: D1Database,
  record: NewWorldEditRecord,
): Promise<WorldEditRecord> {
  const result = await db
    .prepare(
      `INSERT INTO world_edits
       (game_id, session_id, target_kind, target_id, op, payload, prior_state, applied, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?)
       RETURNING seq`,
    )
    .bind(
      record.gameId,
      record.sessionId,
      record.targetKind,
      record.targetId,
      record.op,
      record.payload === null ? null : JSON.stringify(record.payload),
      record.createdAt,
    )
    .first<{ seq: number }>();
  if (!result) throw new AppendWorldEditFailedError();
  return {
    ...record,
    seq: result.seq,
    priorState: null,
    applied: false,
  };
}

export async function getSessionEdits(
  db: D1Database,
  sessionId: string,
): Promise<WorldEditRecord[]> {
  const result = await db
    .prepare("SELECT * FROM world_edits WHERE session_id = ? ORDER BY seq")
    .bind(sessionId)
    .all<WorldEditRow>();
  return result.results.map(rowToWorldEdit);
}
