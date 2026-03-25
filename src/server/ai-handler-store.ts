import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { VerbHandler } from "../core/verb-types.js";
import type { VerbRegistry } from "../core/verbs.js";
import type { HandlerData } from "../core/game-data.js";
import { handlerDataToHandler } from "../core/handler-eval.js";

/**
 * An AI-generated handler record stored in JSONL.
 * Extends HandlerData with persistence metadata.
 */
export type AiHandlerRecord = HandlerData & {
  createdAt: string;
  gameId: string;
};

function handlerFilePath(gameId: string): string {
  return resolve(process.cwd(), `data/ai-handlers-${gameId}.jsonl`);
}

function ensureDataDir(): void {
  const dataDir = resolve(process.cwd(), "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

export function saveHandlerRecord(record: AiHandlerRecord): void {
  ensureDataDir();
  appendFileSync(handlerFilePath(record.gameId), JSON.stringify(record) + "\n");
}

export function loadAiHandlers(gameId: string, verbs: VerbRegistry): void {
  const filePath = handlerFilePath(gameId);
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return;
  const records = content.split("\n").map((line) => JSON.parse(line) as AiHandlerRecord);
  for (const record of records) {
    verbs.register(recordToHandler(record));
  }
}

export function recordToHandler(record: AiHandlerRecord): VerbHandler {
  const handler = handlerDataToHandler(record);
  handler.source = "ai-handler-store";
  return handler;
}
