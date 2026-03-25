import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { EntityStore } from "../core/entity.js";
import type { WorldEvent } from "../core/verb-types.js";

/** A single command's worth of events */
export interface EventLogEntry {
  /** The raw command text */
  command: string;
  /** All events that resulted from this command */
  events: WorldEvent[];
  timestamp: string;
}

function logFilePath(gameId: string): string {
  return resolve(process.cwd(), `data/event-log-${gameId}.jsonl`);
}

function ensureDataDir(): void {
  const dataDir = resolve(process.cwd(), "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

/** Append a command's events to the log */
export function appendEventLog(gameId: string, entry: EventLogEntry): void {
  ensureDataDir();
  const filePath = logFilePath(gameId);
  const line = JSON.stringify(entry) + "\n";
  appendFileSync(filePath, line);
}

/** Load all event log entries for a game */
export function loadEventLog(gameId: string): EventLogEntry[] {
  const filePath = logFilePath(gameId);
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").map((line) => JSON.parse(line) as EventLogEntry);
}

/** Replay all events from the log onto the store */
export function replayEventLog(gameId: string, store: EntityStore): void {
  const entries = loadEventLog(gameId);
  for (const entry of entries) {
    applyEvents(store, entry.events);
  }
}

/** Apply a list of events to the store */
export function applyEvents(store: EntityStore, events: WorldEvent[]): void {
  for (const event of events) {
    if (event.type === "set-property" && event.property) {
      store.setProperty(event.entityId, { name: event.property, value: event.value });
    } else if (event.type === "remove-property" && event.property) {
      store.removeProperty(event.entityId, event.property);
    }
  }
}

/** Clear the event log (for /reset) */
export function clearEventLog(gameId: string): void {
  const filePath = logFilePath(gameId);
  if (existsSync(filePath)) {
    writeFileSync(filePath, "");
  }
}

/** Remove the last entry from the event log (for /undo) */
export function popEventLog(gameId: string): EventLogEntry | null {
  const entries = loadEventLog(gameId);
  if (entries.length === 0) return null;
  const popped = entries.pop()!;
  ensureDataDir();
  const filePath = logFilePath(gameId);
  if (entries.length === 0) {
    writeFileSync(filePath, "");
  } else {
    writeFileSync(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  }
  return popped;
}
