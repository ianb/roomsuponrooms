import type {
  RuntimeStorage,
  AiEntityRecord,
  AiHandlerRecord,
  EventLogEntry,
  WordEntryRecord,
  UserRecord,
  SessionKey,
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
  user_id: string;
  seq: number;
  command: string;
  events: string;
  timestamp: string;
}

interface ConversationRow {
  game_id: string;
  user_id: string;
  npc_id: string;
  word: string;
  entry: string;
  created_at: string;
}

interface UserRow {
  id: string;
  display_name: string;
  email: string | null;
  google_id: string | null;
  roles: string;
  created_at: string;
  last_login_at: string;
}

function userRowToRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    googleId: row.google_id,
    roles: JSON.parse(row.roles) as UserRecord["roles"],
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
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

  // --- Event Log (per-user) ---

  async loadEvents(session: SessionKey): Promise<EventLogEntry[]> {
    const result = await this.db
      .prepare("SELECT * FROM events WHERE game_id = ? AND user_id = ? ORDER BY seq")
      .bind(session.gameId, session.userId)
      .all<EventRow>();
    return result.results.map((row) => ({
      command: row.command,
      events: JSON.parse(row.events),
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
    const nextSeq = (maxSeq || 0) + 1;
    await this.db
      .prepare(
        `INSERT INTO events (game_id, user_id, seq, command, events, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        session.gameId,
        session.userId,
        nextSeq,
        entry.command,
        JSON.stringify(entry.events),
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
    return {
      command: row.command,
      events: JSON.parse(row.events),
      timestamp: row.timestamp,
    };
  }

  // --- Conversations (per-user) ---

  async loadConversationEntries(session: SessionKey, npcId: string): Promise<WordEntryRecord[]> {
    const result = await this.db
      .prepare(
        "SELECT * FROM conversation_entries WHERE game_id = ? AND user_id = ? AND npc_id = ? ORDER BY created_at",
      )
      .bind(session.gameId, session.userId, npcId)
      .all<ConversationRow>();
    return result.results.map((row) => {
      const entry = JSON.parse(row.entry) as WordEntryRecord;
      return {
        ...entry,
        createdAt: row.created_at,
        gameId: row.game_id,
        userId: row.user_id,
        npcId: row.npc_id,
      };
    });
  }

  async saveWordEntry(record: WordEntryRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO conversation_entries (game_id, user_id, npc_id, word, entry, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.gameId,
        record.userId,
        record.npcId,
        record.word,
        JSON.stringify(record),
        record.createdAt,
      )
      .run();
  }

  // --- Users ---

  async findUserByGoogleId(googleId: string): Promise<UserRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM users WHERE google_id = ?")
      .bind(googleId)
      .first<UserRow>();
    return row ? userRowToRecord(row) : null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const row = await this.db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
    return row ? userRowToRecord(row) : null;
  }

  async findUserByName(name: string): Promise<UserRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM users WHERE display_name = ?")
      .bind(name)
      .first<UserRow>();
    return row ? userRowToRecord(row) : null;
  }

  async hasAnyUsers(): Promise<boolean> {
    const row = await this.db.prepare("SELECT 1 FROM users LIMIT 1").first<{ 1: number }>();
    return row !== null;
  }

  async createUser(record: UserRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO users (id, display_name, email, google_id, roles, created_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.displayName,
        record.email,
        record.googleId,
        JSON.stringify(record.roles),
        record.createdAt,
        record.lastLoginAt,
      )
      .run();
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.db
      .prepare("UPDATE users SET last_login_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), userId)
      .run();
  }
}
