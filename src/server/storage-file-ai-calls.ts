import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import type { AiCallRecord, AiCallSummary } from "./storage.js";

/**
 * File-backed AI call log. One JSONL per game at
 * `{dataDir}/{gameId}/ai-calls.jsonl`. Appended on every LLM call; pruned
 * occasionally to keep the file from growing unboundedly.
 *
 * This is the local-dev counterpart to the D1 ai_calls table. The retention
 * policy matches (14 days). Pruning happens probabilistically on write, so
 * there's no background task needed — same strategy as error_log.
 */

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const PRUNE_PROBABILITY = 0.05;

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export class FileAiCallLog {
  constructor(private dataDir: string) {}

  private filePath(gameId: string): string {
    return resolve(this.dataDir, gameId, "ai-calls.jsonl");
  }

  private listGameIds(): string[] {
    if (!existsSync(this.dataDir)) return [];
    return readdirSync(this.dataDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }

  private readAll(gameId: string): AiCallRecord[] {
    const path = this.filePath(gameId);
    if (!existsSync(path)) return [];
    const content = readFileSync(path, "utf-8").trim();
    if (!content) return [];
    return content.split("\n").map((line) => JSON.parse(line) as AiCallRecord);
  }

  async logAiCall(record: AiCallRecord): Promise<void> {
    const path = this.filePath(record.gameId);
    ensureDir(path);
    appendFileSync(path, JSON.stringify(record) + "\n");
    if (Math.random() < PRUNE_PROBABILITY) {
      this.prune();
    }
  }

  async getAiCall(id: string): Promise<AiCallRecord | null> {
    // Id isn't tied to a game, so scan every game's log. Small cost — call
    // ids are queried from admin/debug paths, not hot ones.
    for (const gameId of this.listGameIds()) {
      const records = this.readAll(gameId);
      const hit = records.find((r) => r.id === id);
      if (hit) return hit;
    }
    return null;
  }

  async listAiCalls(filter: { gameId?: string; limit?: number }): Promise<AiCallSummary[]> {
    const gameIds = filter.gameId ? [filter.gameId] : this.listGameIds();
    const all: AiCallRecord[] = [];
    for (const gameId of gameIds) {
      all.push(...this.readAll(gameId));
    }
    all.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    const limited = filter.limit ? all.slice(0, filter.limit) : all;
    return limited.map(toSummary);
  }

  private prune(): void {
    const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
    for (const gameId of this.listGameIds()) {
      const path = this.filePath(gameId);
      if (!existsSync(path)) continue;
      const records = this.readAll(gameId);
      const kept = records.filter((r) => r.timestamp >= cutoff);
      if (kept.length === records.length) continue;
      const body = kept.map((r) => JSON.stringify(r)).join("\n");
      writeFileSync(path, body.length > 0 ? body + "\n" : "");
    }
  }
}

function toSummary(record: AiCallRecord): AiCallSummary {
  return {
    id: record.id,
    timestamp: record.timestamp,
    gameId: record.gameId,
    userId: record.userId,
    kind: record.kind,
    context: record.context,
    model: record.model,
    durationMs: record.durationMs,
    error: record.error,
  };
}
