import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Shared JSONL helpers for the file-backed storage implementations.
 *
 * Reads are tolerant: blank lines are skipped, and a corrupt line (e.g. a
 * truncated final record from an interrupted write) is logged and skipped
 * rather than failing the whole file.
 */

export function ensureDirFor(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function readJsonl<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, "utf-8").split("\n");
  const records: T[] = [];
  for (const [i, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line) as T);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[jsonl] Skipping corrupt line ${i + 1} of ${filePath}: ${message}`);
    }
  }
  return records;
}

export function appendJsonl(filePath: string, record: unknown): void {
  ensureDirFor(filePath);
  appendFileSync(filePath, JSON.stringify(record) + "\n");
}

export function writeJsonl(filePath: string, records: unknown[]): void {
  ensureDirFor(filePath);
  if (records.length === 0) {
    writeFileSync(filePath, "");
    return;
  }
  writeFileSync(filePath, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
}
