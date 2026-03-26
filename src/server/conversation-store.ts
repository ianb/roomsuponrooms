import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { WordEntry, ConversationData } from "../core/conversation.js";
import type { ConversationFileData } from "../core/game-data.js";

/** A persisted word entry record, with metadata */
export interface WordEntryRecord extends WordEntry {
  createdAt: string;
  gameId: string;
  npcId: string;
}

/** Get the JSONL file path for an NPC's conversation data */
function npcFilePath(gameId: string, npcId: string): string {
  const safeId = npcId.replace(/:/g, "_");
  return resolve(process.cwd(), `data/npc/${gameId}/${safeId}.jsonl`);
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** Append a new word entry to an NPC's conversation file */
export function saveWordEntry(record: WordEntryRecord): void {
  const filePath = npcFilePath(record.gameId, record.npcId);
  ensureDir(filePath);
  appendFileSync(filePath, JSON.stringify(record) + "\n");
}

/** Load all conversation data for an NPC (from file + initial game data) */
export function loadConversationData(
  gameId: string,
  { npcId, initial }: { npcId: string; initial: ConversationFileData | null },
): ConversationData {
  const words: WordEntry[] = initial ? [...initial.words] : [];

  const filePath = npcFilePath(gameId, npcId);
  if (existsSync(filePath)) {
    const content = readFileSync(filePath, "utf-8").trim();
    if (content) {
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const record = JSON.parse(trimmed) as WordEntryRecord;
        words.push(record);
      }
    }
  }

  return { words, closed: initial ? initial.closed : undefined };
}
