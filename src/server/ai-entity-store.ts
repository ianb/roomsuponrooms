import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { EntityStore } from "../core/entity.js";
import type { EntityData } from "../core/game-data.js";

export type AiEntityRecord = EntityData & {
  createdAt: string;
  gameId: string;
};

function entityFilePath(gameId: string): string {
  return resolve(process.cwd(), `data/ai-entities-${gameId}.jsonl`);
}

function ensureDataDir(): void {
  const dataDir = resolve(process.cwd(), "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

export function saveAiEntity(record: AiEntityRecord): void {
  ensureDataDir();
  appendFileSync(entityFilePath(record.gameId), JSON.stringify(record) + "\n");
}

/** Get the set of AI-created entity IDs for a game */
export function getAiEntityIds(gameId: string): Set<string> {
  const filePath = entityFilePath(gameId);
  if (!existsSync(filePath)) return new Set();
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return new Set();
  const records = content.split("\n").map((line) => JSON.parse(line) as AiEntityRecord);
  return new Set(records.map((r) => r.id));
}

/** Remove an AI-created entity from the persistence file */
export function removeAiEntity(gameId: string, entityId: string): boolean {
  const filePath = entityFilePath(gameId);
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return false;
  const lines = content.split("\n");
  const filtered = lines.filter((line) => {
    const record = JSON.parse(line) as AiEntityRecord;
    return record.id !== entityId;
  });
  if (filtered.length === lines.length) return false;
  writeFileSync(filePath, filtered.length > 0 ? filtered.join("\n") + "\n" : "");
  return true;
}

/** Load all AI-created entities for a game and recreate them in the store */
export function loadAiEntities(gameId: string, store: EntityStore): void {
  const filePath = entityFilePath(gameId);
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return;
  const records = content.split("\n").map((line) => JSON.parse(line) as AiEntityRecord);
  for (const record of records) {
    if (store.has(record.id)) {
      // Entity already exists — apply property overrides from the record
      const entity = store.get(record.id);
      entity.name = record.name;
      entity.description = record.description;
      if (record.aliases) entity.aliases = record.aliases;
      if (record.secret !== undefined) entity.secret = record.secret;
      if (record.scenery) entity.scenery = record.scenery;
      if (record.exit) entity.exit = record.exit;
      if (record.room) entity.room = { ...entity.room, ...record.room } as typeof entity.room;
      if (record.ai) entity.ai = record.ai;
      if (record.properties) {
        for (const [key, value] of Object.entries(record.properties)) {
          if (value === null) {
            store.removeProperty(record.id, key);
          } else {
            store.setProperty(record.id, { name: key, value });
          }
        }
      }
    } else {
      store.create(record.id, {
        tags: record.tags,
        name: record.name,
        description: record.description,
        location: record.location,
        aliases: record.aliases,
        secret: record.secret,
        scenery: record.scenery,
        exit: record.exit,
        room: record.room,
        ai: record.ai,
        properties: record.properties,
      });
    }
  }
}
