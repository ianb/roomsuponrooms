import type { EntityData, HandlerData } from "../core/game-data.js";
import type { WordEntry } from "../core/conversation.js";
import type { WorldEvent } from "../core/verb-types.js";

/** Metadata added to AI-created entities */
export type AiEntityRecord = EntityData & {
  createdAt: string;
  gameId: string;
};

/** Metadata added to AI-created handlers */
export type AiHandlerRecord = HandlerData & {
  createdAt: string;
  gameId: string;
};

/** A single command's worth of events */
export interface EventLogEntry {
  command: string;
  events: WorldEvent[];
  timestamp: string;
}

/** Metadata added to AI-created conversation entries */
export interface WordEntryRecord extends WordEntry {
  createdAt: string;
  gameId: string;
  userId: string;
  npcId: string;
}

/** Identifies a user's session within a game */
export interface SessionKey {
  gameId: string;
  userId: string;
}

/** Known user roles */
export type UserRole = "admin" | "ai" | "debug" | "player";

/** A stored user record */
export interface UserRecord {
  id: string;
  displayName: string;
  email: string | null;
  googleId: string | null;
  roles: UserRole[];
  createdAt: string;
  lastLoginAt: string;
}

/**
 * Abstract storage interface for runtime game data.
 *
 * Game definitions (base entities, handlers, prompts) are loaded
 * from files via readGameDir/loadGameData. This interface handles
 * the mutable runtime data: AI-created content and session events.
 */
export interface RuntimeStorage {
  // --- AI Entities ---
  loadAiEntities(gameId: string): Promise<AiEntityRecord[]>;
  saveAiEntity(record: AiEntityRecord): Promise<void>;
  getAiEntityIds(gameId: string): Promise<Set<string>>;
  removeAiEntity(gameId: string, entityId: string): Promise<boolean>;

  // --- AI Handlers ---
  loadAiHandlers(gameId: string): Promise<AiHandlerRecord[]>;
  saveHandler(record: AiHandlerRecord): Promise<void>;
  listHandlers(gameId: string): Promise<AiHandlerRecord[]>;
  removeHandler(gameId: string, name: string): Promise<boolean>;

  // --- Event Log (per-user) ---
  loadEvents(session: SessionKey): Promise<EventLogEntry[]>;
  appendEvent(session: SessionKey, entry: EventLogEntry): Promise<void>;
  clearEvents(session: SessionKey): Promise<void>;
  popEvent(session: SessionKey): Promise<EventLogEntry | null>;

  // --- Conversations (per-user) ---
  loadConversationEntries(session: SessionKey, npcId: string): Promise<WordEntryRecord[]>;
  saveWordEntry(record: WordEntryRecord): Promise<void>;

  // --- Users ---
  findUserByGoogleId(googleId: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  findUserByName(name: string): Promise<UserRecord | null>;
  hasAnyUsers(): Promise<boolean>;
  createUser(record: UserRecord): Promise<void>;
  updateLastLogin(userId: string): Promise<void>;
}
