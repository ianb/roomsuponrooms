import type { AuthoringInfo, UserRecord } from "./storage.js";

/**
 * Cloudflare D1 database binding type.
 * This matches the D1Database interface from @cloudflare/workers-types.
 */
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(colName?: string): Promise<T | null>;
  run(): Promise<D1Result<unknown>>;
  all<T>(): Promise<D1Result<T>>;
}

export interface D1Result<T> {
  results: T[];
  success: boolean;
}

export interface D1ExecResult {
  count: number;
}

// --- Row types shared between D1Storage methods ---

export interface AuthoringColumns {
  created_by: string | null;
  creation_source: string | null;
  creation_command: string | null;
}

export interface EntityRow extends AuthoringColumns {
  game_id: string;
  id: string;
  tags: string;
  properties: string;
  created_at: string;
}

export interface HandlerRow extends AuthoringColumns {
  game_id: string;
  name: string;
  data: string;
  created_at: string;
}

export interface EventRow {
  game_id: string;
  user_id: string;
  seq: number;
  command: string;
  events: string;
  timestamp: string;
}

export interface ConversationRow extends AuthoringColumns {
  game_id: string;
  user_id: string;
  npc_id: string;
  word: string;
  entry: string;
  created_at: string;
}

export interface BugReportRow {
  id: string;
  game_id: string;
  user_id: string;
  user_name: string | null;
  description: string;
  room_id: string | null;
  room_name: string | null;
  recent_commands: string;
  entity_changes: string | null;
  status: string;
  fix_commit: string | null;
  duplicate_of: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface UserRow {
  id: string;
  display_name: string;
  email: string | null;
  google_id: string | null;
  roles: string;
  created_at: string;
  last_login_at: string;
}

// --- Conversion helpers ---

export function userRowToRecord(row: UserRow): UserRecord {
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

export function rowToAuthoring(row: AuthoringColumns): AuthoringInfo {
  return {
    createdBy: row.created_by || "unknown",
    creationSource: row.creation_source || "unknown",
    creationCommand: row.creation_command || undefined,
  };
}

/** Extract authoring bind values as an array for SQL parameter binding */
export function authoringBindValues(authoring: AuthoringInfo): [string, string, string | null] {
  return [authoring.createdBy, authoring.creationSource, authoring.creationCommand || null];
}
