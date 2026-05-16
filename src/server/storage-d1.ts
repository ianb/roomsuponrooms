/* eslint-disable max-lines -- Thin RuntimeStorage wrapper that delegates to
   per-feature storage-d1-*.ts modules. Each delegating method is three
   trivial lines; adding a new feature grows this file linearly without
   introducing real complexity. The sub-modules are where the actual logic
   lives. */
import type {
  RuntimeStorage,
  AiEntityRecord,
  AiHandlerRecord,
  EventLogEntry,
  WordEntryRecord,
  UserRecord,
  SessionKey,
  ErrorLogRecord,
  BugReport,
  BugReportUpdate,
  UserSessionSummary,
  ImageSettings,
  ImageSettingsInput,
  WorldImageRecord,
  WorldImageQuery,
  AgentSessionRecord,
  AgentSessionStatus,
  WorldEditRecord,
  NewWorldEditRecord,
  AiCallRecord,
  AiCallSummary,
} from "./storage.js";
import * as agentDb from "./storage-d1-agent.js";
import type { D1Database, EntityRow, HandlerRow, EventRow, ConversationRow } from "./d1-types.js";
import * as bugDb from "./storage-d1-bugs.js";
import * as adminDb from "./storage-d1-admin.js";
import * as imageDb from "./storage-d1-images.js";
import * as errorDb from "./storage-d1-errors.js";
import * as aiCallDb from "./storage-d1-ai-calls.js";
import * as userDb from "./storage-d1-users.js";
import { rowToAuthoring, authoringBindValues } from "./d1-types.js";
import { deserializeEntityRow, serializeEntityRecord } from "./entity-serialize.js";

export type { D1Database } from "./d1-types.js";

export class D1Storage implements RuntimeStorage {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  // --- AI Entities ---

  async loadAiEntities(gameId: string): Promise<AiEntityRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM ai_entities WHERE game_id = ? ORDER BY created_at")
      .bind(gameId)
      .all<EntityRow>();
    return result.results.map((row) => deserializeEntityRow(row));
  }

  async saveAiEntity(record: AiEntityRecord): Promise<void> {
    const stored = serializeEntityRecord(record);
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO ai_entities
         (game_id, id, tags, properties, created_at, created_by, creation_source, creation_command)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.gameId,
        record.id,
        JSON.stringify(record.tags),
        stored,
        record.createdAt,
        ...authoringBindValues(record.authoring),
      )
      .run();
  }

  async getAiEntityIds(gameId: string): Promise<Set<string>> {
    const result = await this.db
      .prepare("SELECT id FROM ai_entities WHERE game_id = ?")
      .bind(gameId)
      .all<{ id: string }>();
    return new Set(result.results.map((r) => r.id));
  }

  async removeAiEntity(gameId: string, entityId: string): Promise<boolean> {
    const result = await this.db
      .prepare("DELETE FROM ai_entities WHERE game_id = ? AND id = ?")
      .bind(gameId, entityId)
      .run();
    return (result as unknown as { changes: number }).changes > 0;
  }

  // --- AI Handlers ---

  async loadAiHandlers(gameId: string): Promise<AiHandlerRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM ai_handlers WHERE game_id = ? ORDER BY created_at")
      .bind(gameId)
      .all<HandlerRow>();
    return result.results.map((row) => {
      const data = JSON.parse(row.data) as AiHandlerRecord;
      return {
        ...data,
        createdAt: row.created_at,
        gameId: row.game_id,
        authoring: rowToAuthoring(row),
      };
    });
  }

  async saveHandler(record: AiHandlerRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO ai_handlers
         (game_id, name, data, created_at, created_by, creation_source, creation_command)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.gameId,
        record.name,
        JSON.stringify(record),
        record.createdAt,
        ...authoringBindValues(record.authoring),
      )
      .run();
  }

  async listHandlers(gameId: string): Promise<AiHandlerRecord[]> {
    return this.loadAiHandlers(gameId);
  }

  async removeHandler(gameId: string, name: string): Promise<boolean> {
    const result = await this.db
      .prepare("DELETE FROM ai_handlers WHERE game_id = ? AND name = ?")
      .bind(gameId, name)
      .run();
    return (result as unknown as { changes: number }).changes > 0;
  }

  // --- Event Log (per-user) ---

  async loadEvents(session: SessionKey): Promise<EventLogEntry[]> {
    const result = await this.db
      .prepare("SELECT * FROM events WHERE game_id = ? AND user_id = ? ORDER BY seq")
      .bind(session.gameId, session.userId)
      .all<EventRow>();
    return result.results.map((row) => ({
      command: row.command,
      events: JSON.parse(row.events),
      output: row.output || "",
      timestamp: row.timestamp,
    }));
  }

  async appendEvent(session: SessionKey, entry: EventLogEntry): Promise<void> {
    const maxSeq = await this.db
      .prepare(
        "SELECT COALESCE(MAX(seq), 0) as max_seq FROM events WHERE game_id = ? AND user_id = ?",
      )
      .bind(session.gameId, session.userId)
      .first<number>("max_seq");
    await this.db
      .prepare(
        "INSERT INTO events (game_id, user_id, seq, command, events, output, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        session.gameId,
        session.userId,
        (maxSeq || 0) + 1,
        entry.command,
        JSON.stringify(entry.events),
        entry.output || "",
        entry.timestamp,
      )
      .run();
  }

  async clearEvents(session: SessionKey): Promise<void> {
    await this.db
      .prepare("DELETE FROM events WHERE game_id = ? AND user_id = ?")
      .bind(session.gameId, session.userId)
      .run();
  }

  async popEvent(session: SessionKey): Promise<EventLogEntry | null> {
    const row = await this.db
      .prepare("SELECT * FROM events WHERE game_id = ? AND user_id = ? ORDER BY seq DESC LIMIT 1")
      .bind(session.gameId, session.userId)
      .first<EventRow>();
    if (!row) return null;
    await this.db
      .prepare("DELETE FROM events WHERE game_id = ? AND user_id = ? AND seq = ?")
      .bind(session.gameId, session.userId, row.seq)
      .run();
    return { command: row.command, events: JSON.parse(row.events), timestamp: row.timestamp };
  }

  // --- Conversations ---

  async loadConversationEntries(gameId: string, npcId: string): Promise<WordEntryRecord[]> {
    const result = await this.db
      .prepare(
        "SELECT * FROM conversation_entries WHERE game_id = ? AND npc_id = ? ORDER BY created_at",
      )
      .bind(gameId, npcId)
      .all<ConversationRow>();
    return result.results.map((row) => {
      const entry = JSON.parse(row.entry) as WordEntryRecord;
      return {
        ...entry,
        createdAt: row.created_at,
        gameId: row.game_id,
        npcId: row.npc_id,
        authoring: rowToAuthoring(row),
      };
    });
  }

  async saveWordEntry(record: WordEntryRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO conversation_entries
         (game_id, user_id, npc_id, word, entry, created_at, created_by, creation_source, creation_command)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.gameId,
        "shared",
        record.npcId,
        record.word,
        JSON.stringify(record),
        record.createdAt,
        ...authoringBindValues(record.authoring),
      )
      .run();
  }

  // --- Users ---
  async findUserByGoogleId(googleId: string): Promise<UserRecord | null> {
    return userDb.findUserByGoogleId(this.db, googleId);
  }
  async findUserById(id: string): Promise<UserRecord | null> {
    return userDb.findUserById(this.db, id);
  }
  async findUserByName(name: string): Promise<UserRecord | null> {
    return userDb.findUserByName(this.db, name);
  }
  async hasAnyUsers(): Promise<boolean> {
    return userDb.hasAnyUsers(this.db);
  }
  async createUser(record: UserRecord): Promise<void> {
    return userDb.createUser(this.db, record);
  }
  async updateLastLogin(userId: string): Promise<void> {
    return userDb.updateLastLogin(this.db, userId);
  }

  async recordAiUsage(userId: string, callType: string): Promise<void> {
    return adminDb.recordAiUsage(this.db, { userId, callType });
  }
  async countAiUsage(userId: string, since: string): Promise<number> {
    return adminDb.countAiUsage(this.db, { userId, since });
  }
  async listUsers(): Promise<UserRecord[]> {
    return adminDb.listUsers(this.db);
  }
  async listUserSessions(): Promise<UserSessionSummary[]> {
    return adminDb.listUserSessions(this.db);
  }
  async listAiUsageByUser(): Promise<Array<{ userId: string; total: number }>> {
    return adminDb.listAiUsageByUser(this.db);
  }
  async saveBugReport(report: BugReport): Promise<void> {
    return bugDb.saveBugReport(this.db, report);
  }
  async listBugReports(opts?: { status?: string; gameId?: string }): Promise<BugReport[]> {
    return bugDb.listBugReports(this.db, opts);
  }
  async getBugReport(id: string): Promise<BugReport | null> {
    return bugDb.getBugReport(this.db, id);
  }
  async updateBugReport(id: string, update: BugReportUpdate): Promise<void> {
    return bugDb.updateBugReport(this.db, { id, update });
  }
  async logError(entry: ErrorLogRecord): Promise<void> {
    return errorDb.logError(this.db, entry);
  }
  logAiCall(entry: AiCallRecord): Promise<void> {
    return aiCallDb.logAiCall(this.db, entry);
  }
  getAiCall(id: string): Promise<AiCallRecord | null> {
    return aiCallDb.getAiCall(this.db, id);
  }
  listAiCalls(f: { gameId?: string; limit?: number }): Promise<AiCallSummary[]> {
    return aiCallDb.listAiCalls(this.db, f);
  }
  async getImageSettings(gameId: string): Promise<ImageSettings | null> {
    return imageDb.getImageSettings(this.db, gameId);
  }
  async saveImageSettings(settings: ImageSettingsInput): Promise<void> {
    return imageDb.saveImageSettings(this.db, settings);
  }
  async getWorldImage(query: WorldImageQuery): Promise<WorldImageRecord | null> {
    return imageDb.getWorldImage(this.db, query);
  }
  async saveWorldImage(record: WorldImageRecord): Promise<void> {
    return imageDb.saveWorldImage(this.db, record);
  }
  async deleteWorldImage(query: WorldImageQuery): Promise<void> {
    return imageDb.deleteWorldImage(this.db, query);
  }
  async listWorldImages(gameId: string): Promise<WorldImageRecord[]> {
    return imageDb.listWorldImages(this.db, gameId);
  }

  // --- Agent sessions ---
  async createAgentSession(record: AgentSessionRecord): Promise<void> {
    return agentDb.createAgentSession(this.db, record);
  }
  async getAgentSession(id: string): Promise<AgentSessionRecord | null> {
    return agentDb.getAgentSession(this.db, id);
  }
  async updateAgentSession(id: string, patch: Partial<AgentSessionRecord>): Promise<void> {
    return agentDb.updateAgentSession(this.db, { id, patch });
  }
  async listAgentSessions(filter?: {
    gameId?: string;
    status?: AgentSessionStatus;
  }): Promise<AgentSessionRecord[]> {
    return agentDb.listAgentSessions(this.db, filter);
  }

  // --- World edits ---
  async appendWorldEdit(record: NewWorldEditRecord): Promise<WorldEditRecord> {
    return agentDb.appendWorldEdit(this.db, record);
  }
  async getSessionEdits(sessionId: string): Promise<WorldEditRecord[]> {
    return agentDb.getSessionEdits(this.db, sessionId);
  }
  async commitSession(sessionId: string, summary: string): Promise<void> {
    return agentDb.commitSession(this.db, { sessionId, summary });
  }
}
