import type { EntityData, HandlerData } from "../core/game-data.js";
import type { WordEntry } from "../core/conversation.js";
import type { WorldEvent } from "../core/verb-types.js";

/** Provenance metadata for AI-generated content */
export interface AuthoringInfo {
  createdBy: string;
  creationSource: string;
  creationCommand?: string;
  /**
   * Id of the logged AI call that produced this content, if any. Points into
   * the ai_calls log so you can retrieve the exact prompt and response that
   * generated an entity after the fact. May be absent for content authored
   * before AI call logging was introduced, or for non-AI creation paths.
   */
  aiCallId?: string;
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
  /** The text response shown to the player after this command. May be empty. */
  output?: string;
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

// --- Agent sessions and world edits ---

export type AgentSessionStatus = "running" | "finished" | "bailed" | "failed";

/**
 * Cumulative token usage across every generateText call in a session.
 * Mirrors the Vercel AI SDK's LanguageModelUsage shape but only the fields
 * we actually persist. All counts are sums across ticks.
 */
export interface AgentTokenUsage {
  /** Total input (prompt) tokens, including both cached and uncached. */
  inputTokens: number;
  /** Cached prompt tokens read (billed at the cache-read rate). */
  cacheReadTokens: number;
  /** Cached prompt tokens written (billed at the cache-write rate, if any). */
  cacheWriteTokens: number;
  /** Total output (completion) tokens. */
  outputTokens: number;
  /** Reasoning/thinking tokens, included in outputTokens. */
  reasoningTokens: number;
  /** inputTokens + outputTokens (provider-reported). */
  totalTokens: number;
}

export function emptyAgentTokenUsage(): AgentTokenUsage {
  return {
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  };
}

/** Persistent state for one run of the agentic world editor */
export interface AgentSessionRecord {
  id: string;
  gameId: string;
  userId: string;
  request: string;
  status: AgentSessionStatus;
  /** Full Claude messages array (assistant/user/tool messages with tool_use/tool_result blocks) */
  messages: unknown[];
  /** Session-scoped scratchpad: results from save_var */
  savedVars: Record<string, unknown>;
  turnCount: number;
  turnLimit: number;
  /** Populated by finish() */
  summary: string | null;
  /** If this session reverts another, the original session id */
  revertOf: string | null;
  /** The LLM model id used for this session, e.g. "gemini-3-flash-preview". */
  model: string | null;
  /** The system prompt text used on the first tick. Captured once. */
  systemPrompt: string | null;
  /** Cumulative token usage across every generateText call in this session. */
  tokenUsage: AgentTokenUsage;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export type WorldEditTargetKind = "entity" | "handler";
export type WorldEditOp = "create" | "update" | "delete";

/** A pending or applied structural edit emitted by an agent session */
export interface WorldEditRecord {
  seq: number;
  gameId: string;
  sessionId: string;
  targetKind: WorldEditTargetKind;
  targetId: string;
  op: WorldEditOp;
  /** JSON: full record (create), partial overlay w/ nulls (update), null (delete) */
  payload: unknown;
  /** Captured at commit time. Null until commit; null for create. */
  priorState: unknown;
  applied: boolean;
  createdAt: string;
}

/** Input for appendWorldEdit — seq is assigned by storage */
export type NewWorldEditRecord = Omit<WorldEditRecord, "seq" | "applied" | "priorState">;

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

  // --- Agent sessions ---
  createAgentSession(record: AgentSessionRecord): Promise<void>;
  getAgentSession(id: string): Promise<AgentSessionRecord | null>;
  updateAgentSession(id: string, patch: Partial<AgentSessionRecord>): Promise<void>;
  listAgentSessions(filter?: {
    gameId?: string;
    status?: AgentSessionStatus;
  }): Promise<AgentSessionRecord[]>;

  // --- World edits (the agent edit log) ---
  appendWorldEdit(record: NewWorldEditRecord): Promise<WorldEditRecord>;
  getSessionEdits(sessionId: string): Promise<WorldEditRecord[]>;
  /**
   * Atomically apply all pending edits in a session to the materialized
   * ai_entities/ai_handlers tables, capture prior_state for each edit,
   * mark them applied, and flip the session's status to 'finished' with
   * the given summary.
   */
  commitSession(sessionId: string, summary: string): Promise<void>;

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

  // --- AI Call Log (optional — stores prompt/response for single-shot LLM calls) ---
  logAiCall?(record: AiCallRecord): Promise<void>;
  getAiCall?(id: string): Promise<AiCallRecord | null>;
  listAiCalls?(filter: { gameId?: string; limit?: number }): Promise<AiCallSummary[]>;

  // --- Image Settings (optional — admin only) ---
  getImageSettings?(gameId: string): Promise<ImageSettings | null>;
  saveImageSettings?(settings: ImageSettingsInput): Promise<void>;
  getWorldImage?(query: WorldImageQuery): Promise<WorldImageRecord | null>;
  saveWorldImage?(record: WorldImageRecord): Promise<void>;
  deleteWorldImage?(query: WorldImageQuery): Promise<void>;
  listWorldImages?(gameId: string): Promise<WorldImageRecord[]>;
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

// --- Image Settings ---

export interface ImageSettings {
  gameId: string;
  imagesEnabled: boolean;
  imageStyleRoom: string | null;
  imageStyleNpc: string | null;
  updatedAt: string;
}

export interface ImageSettingsInput {
  gameId: string;
  imagesEnabled: boolean;
  imageStyleRoom: string | null;
  imageStyleNpc: string | null;
}

export interface WorldImageQuery {
  gameId: string;
  imageType: string;
}

export interface WorldImageRecord {
  gameId: string;
  imageType: string;
  r2Key: string;
  promptUsed: string;
  stylePrompt: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  createdAt: string;
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

/**
 * A single server-side LLM call — captured so that when AI-generated content
 * looks wrong after the fact, you can retrieve the exact prompt and response
 * that produced it. Referenced by AuthoringInfo.aiCallId on AI-authored
 * entities. Pruned on a rolling window so the table doesn't grow forever.
 */
export interface AiCallRecord {
  /** Unique id, e.g. "aic-{timestamp}-{random}". */
  id: string;
  timestamp: string;
  gameId: string;
  userId: string;
  /**
   * Which creation path made the call — room, entity, exit, scenery,
   * verb-fallback, conversation, etc. Used for filtering and debugging.
   */
  kind: string;
  /** Short human-readable context, e.g. "unresolved-exit w from room:food-row". */
  context: string;
  /** LLM model id (from process.env LLM_MODEL), e.g. "claude-opus-4-6". */
  model: string;
  systemPrompt: string;
  prompt: string;
  /** The LLM's structured output (result.object). May be undefined if the call failed. */
  response: unknown;
  durationMs: number;
  /** Input (prompt) tokens, if reported by the provider. */
  tokensIn?: number;
  /** Output (completion) tokens, if reported by the provider. */
  tokensOut?: number;
  /** Error message if the call threw, or absent on success. */
  error?: string;
}

/** A listing row — omits the large prompt/response fields for efficient listing. */
export interface AiCallSummary {
  id: string;
  timestamp: string;
  gameId: string;
  userId: string;
  kind: string;
  context: string;
  model: string;
  durationMs: number;
  error?: string;
}
