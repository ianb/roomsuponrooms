import type { EntityData, HandlerData } from "../core/game-data.js";
import type { WordEntry } from "../core/conversation.js";
import type { WorldEvent } from "../core/verb-types.js";

/** Provenance metadata for AI-generated content */
export interface AuthoringInfo {
  createdBy: string;
  creationSource: string;
  creationCommand?: string;
}

/** Metadata added to AI-created entities */
export type AiEntityRecord = EntityData & {
  createdAt: string;
  gameId: string;
  authoring: AuthoringInfo;
};

/** Metadata added to AI-created handlers */
export type AiHandlerRecord = HandlerData & {
  createdAt: string;
  gameId: string;
  authoring: AuthoringInfo;
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
  npcId: string;
  authoring: AuthoringInfo;
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

  // --- Conversations (shared world content) ---
  loadConversationEntries(gameId: string, npcId: string): Promise<WordEntryRecord[]>;
  saveWordEntry(record: WordEntryRecord): Promise<void>;

  // --- Users ---
  findUserByGoogleId(googleId: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  findUserByName(name: string): Promise<UserRecord | null>;
  hasAnyUsers(): Promise<boolean>;
  createUser(record: UserRecord): Promise<void>;
  updateLastLogin(userId: string): Promise<void>;

  // --- AI Usage Quota ---
  recordAiUsage(userId: string, callType: string): Promise<void>;
  countAiUsage(userId: string, since: string): Promise<number>;

  // --- Admin (aggregate queries, optional — only D1 implements) ---
  listUsers?(): Promise<UserRecord[]>;
  listUserSessions?(): Promise<UserSessionSummary[]>;
  listAiUsageByUser?(): Promise<Array<{ userId: string; total: number }>>;

  // --- Bug Reports ---
  saveBugReport(report: BugReport): Promise<void>;
  listBugReports(opts?: { status?: string; gameId?: string }): Promise<BugReport[]>;
  getBugReport(id: string): Promise<BugReport | null>;
  updateBugReport(id: string, update: BugReportUpdate): Promise<void>;

  // --- Error Log (optional — only D1 persists) ---
  logError?(entry: ErrorLogRecord): Promise<void>;
}

// --- Bug Reports ---

export type BugReportStatus = "new" | "seen" | "fixed" | "invalid" | "duplicate";

export interface EntityChangeRecord {
  id: string;
  name: string;
  changes: Array<{ field: string; from: unknown; to: unknown }>;
}

export interface BugReport {
  id: string;
  gameId: string;
  userId: string;
  userName: string | null;
  description: string;
  roomId: string | null;
  roomName: string | null;
  recentCommands: EventLogEntry[];
  entityChanges: EntityChangeRecord[];
  status: BugReportStatus;
  fixCommit: string | null;
  duplicateOf: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface BugReportUpdate {
  status?: BugReportStatus;
  fixCommit?: string;
  duplicateOf?: string;
}

export interface UserSessionSummary {
  userId: string;
  gameId: string;
  eventCount: number;
  lastActivity: string;
}

export interface ErrorLogRecord {
  timestamp: string;
  source: string;
  message: string;
  stack?: string;
  context?: string;
  userId?: string;
  gameId?: string;
}
