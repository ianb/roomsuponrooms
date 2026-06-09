import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { D1Database, D1PreparedStatement, D1Result } from "../src/server/d1-types.js";

/**
 * In-memory D1Database stub backed by node:sqlite, with the real production
 * migrations applied. Mirrors D1 semantics where they matter:
 * - run() reports row counts under `meta.changes` (not top-level)
 * - batch() executes inside a transaction and rolls back on failure
 * - booleans bind as 0/1, like D1's type coercion
 */

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations");

type SqliteValue = null | number | bigint | string | Uint8Array;

function coerceBindValue(value: unknown): SqliteValue {
  if (value === true) return 1;
  if (value === false) return 0;
  return value as SqliteValue;
}

class StubStatement implements D1PreparedStatement {
  constructor(
    private db: DatabaseSync,
    private opts: { sql: string; values: unknown[] },
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new StubStatement(this.db, { sql: this.opts.sql, values });
  }

  private boundValues(): SqliteValue[] {
    return this.opts.values.map((v) => coerceBindValue(v));
  }

  async first<T>(colName?: string): Promise<T | null> {
    const row = this.db.prepare(this.opts.sql).get(...this.boundValues());
    if (row === undefined) return null;
    if (colName === undefined) return row as T;
    const value = new Map(Object.entries(row as Record<string, unknown>)).get(colName);
    return value === undefined ? null : (value as T);
  }

  async run(): Promise<D1Result<unknown>> {
    const info = this.db.prepare(this.opts.sql).run(...this.boundValues());
    return { results: [], success: true, meta: { changes: Number(info.changes) } };
  }

  async all<T>(): Promise<D1Result<T>> {
    const rows = this.db.prepare(this.opts.sql).all(...this.boundValues());
    return { results: rows as T[], success: true };
  }

  /** Used by batch() to execute within the surrounding transaction. */
  runSync(): D1Result<unknown> {
    const info = this.db.prepare(this.opts.sql).run(...this.boundValues());
    return { results: [], success: true, meta: { changes: Number(info.changes) } };
  }
}

class StubD1 implements D1Database {
  constructor(private db: DatabaseSync) {}

  prepare(query: string): D1PreparedStatement {
    return new StubStatement(this.db, { sql: query, values: [] });
  }

  async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    this.db.exec("BEGIN");
    try {
      const results = statements.map((s) => (s as StubStatement).runSync() as D1Result<T>);
      this.db.exec("COMMIT");
      return results;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  async exec(query: string): Promise<{ count: number }> {
    this.db.exec(query);
    return { count: 1 };
  }
}

/** Create a fresh in-memory D1 database with all migrations applied. */
export function createTestD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .toSorted();
  for (const file of files) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- enumerated from the repo's own migrations/ dir
    db.exec(readFileSync(join(migrationsDir, file), "utf-8"));
  }
  return new StubD1(db);
}
