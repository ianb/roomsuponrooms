import type { D1Database } from "./d1-types.js";
import type { AiCallRecord, AiCallSummary } from "./storage.js";

/**
 * D1-backed AI call log. Mirror of FileAiCallLog for the Worker runtime.
 * Retention: 14 days, pruned probabilistically on write — same pattern as
 * error_log (see storage-d1-errors.ts). The 14-day window is longer than
 * error_log's 2 days because the AI-authored entities these calls describe
 * live much longer, and the whole point is to still have the prompt on
 * hand when investigating a broken entity days later.
 */

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const PRUNE_PROBABILITY = 0.05;

interface AiCallRow {
  id: string;
  timestamp: string;
  game_id: string;
  user_id: string;
  kind: string;
  context: string;
  model: string;
  system_prompt: string;
  prompt: string;
  response: string | null;
  duration_ms: number;
  tokens_in: number | null;
  tokens_out: number | null;
  error: string | null;
}

function rowToRecord(row: AiCallRow): AiCallRecord {
  return {
    id: row.id,
    timestamp: row.timestamp,
    gameId: row.game_id,
    userId: row.user_id,
    kind: row.kind,
    context: row.context,
    model: row.model,
    systemPrompt: row.system_prompt,
    prompt: row.prompt,
    response: row.response === null ? undefined : (JSON.parse(row.response) as unknown),
    durationMs: row.duration_ms,
    tokensIn: row.tokens_in === null ? undefined : row.tokens_in,
    tokensOut: row.tokens_out === null ? undefined : row.tokens_out,
    error: row.error === null ? undefined : row.error,
  };
}

function rowToSummary(row: AiCallRow): AiCallSummary {
  return {
    id: row.id,
    timestamp: row.timestamp,
    gameId: row.game_id,
    userId: row.user_id,
    kind: row.kind,
    context: row.context,
    model: row.model,
    durationMs: row.duration_ms,
    error: row.error === null ? undefined : row.error,
  };
}

export async function logAiCall(db: D1Database, entry: AiCallRecord): Promise<void> {
  const responseJson = entry.response === undefined ? null : JSON.stringify(entry.response);
  await db
    .prepare(
      `INSERT INTO ai_calls
       (id, timestamp, game_id, user_id, kind, context, model, system_prompt, prompt, response, duration_ms, tokens_in, tokens_out, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entry.id,
      entry.timestamp,
      entry.gameId,
      entry.userId,
      entry.kind,
      entry.context,
      entry.model,
      entry.systemPrompt,
      entry.prompt,
      responseJson,
      entry.durationMs,
      entry.tokensIn || null,
      entry.tokensOut || null,
      entry.error || null,
    )
    .run();
  if (Math.random() < PRUNE_PROBABILITY) {
    const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
    await db.prepare("DELETE FROM ai_calls WHERE timestamp < ?").bind(cutoff).run();
  }
}

export async function getAiCall(db: D1Database, id: string): Promise<AiCallRecord | null> {
  const row = await db.prepare("SELECT * FROM ai_calls WHERE id = ?").bind(id).first<AiCallRow>();
  if (!row) return null;
  return rowToRecord(row);
}

export async function listAiCalls(
  db: D1Database,
  filter: { gameId?: string; limit?: number },
): Promise<AiCallSummary[]> {
  const limit = filter.limit && filter.limit > 0 ? filter.limit : 100;
  const result = filter.gameId
    ? await db
        .prepare("SELECT * FROM ai_calls WHERE game_id = ? ORDER BY timestamp DESC LIMIT ?")
        .bind(filter.gameId, limit)
        .all<AiCallRow>()
    : await db
        .prepare("SELECT * FROM ai_calls ORDER BY timestamp DESC LIMIT ?")
        .bind(limit)
        .all<AiCallRow>();
  return result.results.map(rowToSummary);
}
