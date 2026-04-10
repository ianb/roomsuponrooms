import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import type {
  AgentSessionRecord,
  AgentSessionStatus,
  WorldEditRecord,
  NewWorldEditRecord,
  AiEntityRecord,
  AiHandlerRecord,
} from "./storage.js";
import { emptyAgentTokenUsage } from "./storage.js";
import type { EntityData, HandlerData } from "../core/game-data.js";
import { playSessionEdits } from "./agent-edit-merge.js";

/**
 * Backfill optional fields on session records loaded from disk so older
 * files (written before token usage tracking landed) deserialize cleanly.
 */
function normalizeSession(raw: unknown): AgentSessionRecord {
  const record = raw as Partial<AgentSessionRecord>;
  return {
    ...(record as AgentSessionRecord),
    model: record.model === undefined ? null : record.model,
    systemPrompt: record.systemPrompt === undefined ? null : record.systemPrompt,
    tokenUsage: record.tokenUsage || emptyAgentTokenUsage(),
  };
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export class FileAgentStorage {
  constructor(private dataDir: string) {}

  private sessionsDir(gameId: string): string {
    return resolve(this.dataDir, gameId, "agent-sessions");
  }

  private sessionFile(gameId: string, sessionId: string): string {
    return resolve(this.sessionsDir(gameId), `${sessionId}.json`);
  }

  private editsFile(gameId: string): string {
    return resolve(this.dataDir, gameId, "world-edits.jsonl");
  }

  private entitiesFile(gameId: string): string {
    return resolve(this.dataDir, gameId, "entities.jsonl");
  }

  private handlersFile(gameId: string): string {
    return resolve(this.dataDir, gameId, "handlers.jsonl");
  }

  // --- Sessions ---

  async createAgentSession(record: AgentSessionRecord): Promise<void> {
    const path = this.sessionFile(record.gameId, record.id);
    ensureDir(path);
    writeFileSync(path, JSON.stringify(record, null, 2));
  }

  async getAgentSession(id: string): Promise<AgentSessionRecord | null> {
    // We don't know the gameId from the id alone — scan directories.
    if (!existsSync(this.dataDir)) return null;
    for (const gameDir of readdirSync(this.dataDir, { withFileTypes: true })) {
      if (!gameDir.isDirectory()) continue;
      const path = this.sessionFile(gameDir.name, id);
      if (existsSync(path)) {
        return normalizeSession(JSON.parse(readFileSync(path, "utf-8")));
      }
    }
    return null;
  }

  async updateAgentSession(id: string, patch: Partial<AgentSessionRecord>): Promise<void> {
    const current = await this.getAgentSession(id);
    if (!current) return;
    const updated: AgentSessionRecord = {
      ...current,
      ...patch,
      updatedAt: patch.updatedAt || new Date().toISOString(),
    };
    const path = this.sessionFile(current.gameId, id);
    writeFileSync(path, JSON.stringify(updated, null, 2));
  }

  async listAgentSessions(filter?: {
    gameId?: string;
    status?: AgentSessionStatus;
  }): Promise<AgentSessionRecord[]> {
    if (!existsSync(this.dataDir)) return [];
    const records: AgentSessionRecord[] = [];
    const games = filter && filter.gameId ? [filter.gameId] : this.allGameDirs();
    for (const game of games) {
      const dir = this.sessionsDir(game);
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".json")) continue;
        const record = normalizeSession(JSON.parse(readFileSync(resolve(dir, file), "utf-8")));
        if (filter && filter.status && record.status !== filter.status) continue;
        records.push(record);
      }
    }
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return records;
  }

  private allGameDirs(): string[] {
    if (!existsSync(this.dataDir)) return [];
    return readdirSync(this.dataDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }

  // --- World edits ---

  async appendWorldEdit(record: NewWorldEditRecord): Promise<WorldEditRecord> {
    const path = this.editsFile(record.gameId);
    ensureDir(path);
    const all = this.loadEditsFile(path);
    const seq = all.length > 0 ? Math.max(...all.map((e) => e.seq)) + 1 : 1;
    const stored: WorldEditRecord = {
      ...record,
      seq,
      priorState: null,
      applied: false,
    };
    appendFileSync(path, JSON.stringify(stored) + "\n");
    return stored;
  }

  async getSessionEdits(sessionId: string): Promise<WorldEditRecord[]> {
    if (!existsSync(this.dataDir)) return [];
    const out: WorldEditRecord[] = [];
    for (const game of this.allGameDirs()) {
      const path = this.editsFile(game);
      if (!existsSync(path)) continue;
      for (const edit of this.loadEditsFile(path)) {
        if (edit.sessionId === sessionId) out.push(edit);
      }
    }
    out.sort((a, b) => a.seq - b.seq);
    return out;
  }

  private loadEditsFile(path: string): WorldEditRecord[] {
    if (!existsSync(path)) return [];
    const content = readFileSync(path, "utf-8").trim();
    if (!content) return [];
    return content.split("\n").map((line) => JSON.parse(line) as WorldEditRecord);
  }

  private rewriteEditsFile(path: string, edits: WorldEditRecord[]): void {
    if (edits.length === 0) {
      writeFileSync(path, "");
      return;
    }
    writeFileSync(path, edits.map((e) => JSON.stringify(e)).join("\n") + "\n");
  }

  async commitSession(sessionId: string, summary: string): Promise<void> {
    const session = await this.getAgentSession(sessionId);
    if (!session) return;
    const edits = await this.getSessionEdits(sessionId);
    const pending = edits.filter((e) => !e.applied);
    if (pending.length === 0) {
      await this.updateAgentSession(sessionId, {
        status: "finished",
        summary,
        finishedAt: new Date().toISOString(),
      });
      return;
    }

    const { startEntities, startHandlers } = this.loadStartStates(session.gameId, pending);
    const played = playSessionEdits(pending, { startEntities, startHandlers });
    this.applyPlayedEdits(session, played);
    this.markEditsApplied(session.gameId, played.resolved);

    await this.updateAgentSession(sessionId, {
      status: "finished",
      summary,
      finishedAt: new Date().toISOString(),
    });
  }

  private loadStartStates(
    gameId: string,
    pending: WorldEditRecord[],
  ): {
    startEntities: Map<string, EntityData | null>;
    startHandlers: Map<string, HandlerData | null>;
  } {
    const entityIds = new Set<string>();
    const handlerNames = new Set<string>();
    for (const edit of pending) {
      if (edit.targetKind === "entity") entityIds.add(edit.targetId);
      else handlerNames.add(edit.targetId);
    }
    const startEntities = new Map<string, EntityData | null>();
    const startHandlers = new Map<string, HandlerData | null>();
    const entityRecords = this.loadJsonl<AiEntityRecord>(this.entitiesFile(gameId));
    const latestEntity = new Map<string, AiEntityRecord>();
    for (const r of entityRecords) latestEntity.set(r.id, r);
    for (const id of entityIds) {
      startEntities.set(id, latestEntity.get(id) || null);
    }
    const handlerRecords = this.loadJsonl<AiHandlerRecord>(this.handlersFile(gameId));
    const latestHandler = new Map<string, AiHandlerRecord>();
    for (const r of handlerRecords) latestHandler.set(r.name, r);
    for (const name of handlerNames) {
      startHandlers.set(name, latestHandler.get(name) || null);
    }
    return { startEntities, startHandlers };
  }

  private loadJsonl<T>(path: string): T[] {
    if (!existsSync(path)) return [];
    const content = readFileSync(path, "utf-8").trim();
    if (!content) return [];
    return content.split("\n").map((line) => JSON.parse(line) as T);
  }

  private applyPlayedEdits(
    session: AgentSessionRecord,
    played: ReturnType<typeof playSessionEdits>,
  ): void {
    const now = new Date().toISOString();
    const authoring = {
      createdBy: session.userId,
      creationSource: "agent",
      creationCommand: session.id,
    };
    // Entities: rewrite the JSONL with merged state.
    const entitiesPath = this.entitiesFile(session.gameId);
    const entityRecords = this.loadJsonl<AiEntityRecord>(entitiesPath);
    const filtered = entityRecords.filter((r) => !played.finalEntityState.has(r.id));
    for (const [id, finalState] of played.finalEntityState) {
      if (finalState === null) continue;
      filtered.push({
        ...finalState,
        id,
        createdAt: now,
        gameId: session.gameId,
        authoring,
      });
    }
    ensureDir(entitiesPath);
    writeFileSync(
      entitiesPath,
      filtered.length > 0 ? filtered.map((r) => JSON.stringify(r)).join("\n") + "\n" : "",
    );
    // Handlers: same.
    const handlersPath = this.handlersFile(session.gameId);
    const handlerRecords = this.loadJsonl<AiHandlerRecord>(handlersPath);
    const filteredH = handlerRecords.filter((r) => !played.finalHandlerState.has(r.name));
    for (const [name, finalState] of played.finalHandlerState) {
      if (finalState === null) continue;
      filteredH.push({
        ...finalState,
        name,
        createdAt: now,
        gameId: session.gameId,
        authoring,
      });
    }
    ensureDir(handlersPath);
    writeFileSync(
      handlersPath,
      filteredH.length > 0 ? filteredH.map((r) => JSON.stringify(r)).join("\n") + "\n" : "",
    );
  }

  private markEditsApplied(
    gameId: string,
    resolved: ReturnType<typeof playSessionEdits>["resolved"],
  ): void {
    const path = this.editsFile(gameId);
    const all = this.loadEditsFile(path);
    const updates = new Map<number, { priorState: unknown }>();
    for (const r of resolved) updates.set(r.edit.seq, { priorState: r.priorState });
    const next = all.map((edit) => {
      const u = updates.get(edit.seq);
      if (!u) return edit;
      return { ...edit, priorState: u.priorState, applied: true };
    });
    this.rewriteEditsFile(path, next);
  }
}
