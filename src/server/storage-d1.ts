import type {
  RuntimeStorage,
  AiEntityRecord,
  AiHandlerRecord,
  EventLogEntry,
  WordEntryRecord,
} from "./storage.js";

/**
 * Cloudflare D1 database binding type.
 * This matches the D1Database interface from @cloudflare/workers-types.
 */
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(colName?: string): Promise<T | null>;
  run(): Promise<D1Result<unknown>>;
  all<T>(): Promise<D1Result<T>>;
}

interface D1Result<T> {
  results: T[];
  success: boolean;
}

interface D1ExecResult {
  count: number;
}

/** SQL to create the D1 tables */
export const D1_SCHEMA = `
CREATE TABLE IF NOT EXISTS ai_entities (
  game_id TEXT NOT NULL,
  id TEXT NOT NULL,
  tags TEXT NOT NULL,
  properties TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, id)
);

CREATE TABLE IF NOT EXISTS ai_handlers (
  game_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, name)
);

CREATE TABLE IF NOT EXISTS events (
  game_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  command TEXT NOT NULL,
  events TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  PRIMARY KEY (game_id, seq)
);

CREATE TABLE IF NOT EXISTS conversation_entries (
  game_id TEXT NOT NULL,
  npc_id TEXT NOT NULL,
  word TEXT NOT NULL,
  entry TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, npc_id, word)
);
`;

interface EntityRow {
  game_id: string;
  id: string;
  tags: string;
  properties: string;
  created_at: string;
}

interface HandlerRow {
  game_id: string;
  name: string;
  data: string;
  created_at: string;
}

interface EventRow {
  game_id: string;
  seq: number;
  command: string;
  events: string;
  timestamp: string;
}

interface ConversationRow {
  game_id: string;
  npc_id: string;
  word: string;
  entry: string;
  created_at: string;
}

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
    return result.results.map((row) => ({
      id: row.id,
      tags: JSON.parse(row.tags) as string[],
      properties: JSON.parse(row.properties) as Record<string, unknown>,
      createdAt: row.created_at,
      gameId: row.game_id,
    }));
  }

  async saveAiEntity(record: AiEntityRecord): Promise<void> {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record.properties)) {
      props[key] = value === undefined ? null : value;
    }
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO ai_entities (game_id, id, tags, properties, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        record.gameId,
        record.id,
        JSON.stringify(record.tags),
        JSON.stringify(props),
        record.createdAt,
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
      return { ...data, createdAt: row.created_at, gameId: row.game_id };
    });
  }

  async saveHandler(record: AiHandlerRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO ai_handlers (game_id, name, data, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(record.gameId, record.name, JSON.stringify(record), record.createdAt)
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

  // --- Event Log ---

  async loadEvents(gameId: string): Promise<EventLogEntry[]> {
    const result = await this.db
      .prepare("SELECT * FROM events WHERE game_id = ? ORDER BY seq")
      .bind(gameId)
      .all<EventRow>();
    return result.results.map((row) => ({
      command: row.command,
      events: JSON.parse(row.events),
      timestamp: row.timestamp,
    }));
  }

  async appendEvent(gameId: string, entry: EventLogEntry): Promise<void> {
    const maxSeq = await this.db
      .prepare("SELECT COALESCE(MAX(seq), 0) as max_seq FROM events WHERE game_id = ?")
      .bind(gameId)
      .first<number>("max_seq");
    const nextSeq = (maxSeq || 0) + 1;
    await this.db
      .prepare(
        `INSERT INTO events (game_id, seq, command, events, timestamp)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(gameId, nextSeq, entry.command, JSON.stringify(entry.events), entry.timestamp)
      .run();
  }

  async clearEvents(gameId: string): Promise<void> {
    await this.db.prepare("DELETE FROM events WHERE game_id = ?").bind(gameId).run();
  }

  async popEvent(gameId: string): Promise<EventLogEntry | null> {
    const row = await this.db
      .prepare("SELECT * FROM events WHERE game_id = ? ORDER BY seq DESC LIMIT 1")
      .bind(gameId)
      .first<EventRow>();
    if (!row) return null;
    await this.db
      .prepare("DELETE FROM events WHERE game_id = ? AND seq = ?")
      .bind(gameId, row.seq)
      .run();
    return {
      command: row.command,
      events: JSON.parse(row.events),
      timestamp: row.timestamp,
    };
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
      return { ...entry, createdAt: row.created_at, gameId: row.game_id, npcId: row.npc_id };
    });
  }

  async saveWordEntry(record: WordEntryRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO conversation_entries (game_id, npc_id, word, entry, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(record.gameId, record.npcId, record.word, JSON.stringify(record), record.createdAt)
      .run();
  }
}
