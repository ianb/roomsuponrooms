import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type {
  RuntimeStorage,
  AiEntityRecord,
  AiHandlerRecord,
  EventLogEntry,
  WordEntryRecord,
  UserRecord,
  SessionKey,
  BugReport,
  BugReportUpdate,
  ImageSettings,
  ImageSettingsInput,
  WorldImageRecord,
} from "./storage.js";

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readJsonl<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").map((line) => JSON.parse(line) as T);
}

function appendJsonl(filePath: string, record: unknown): void {
  ensureDir(filePath);
  appendFileSync(filePath, JSON.stringify(record) + "\n");
}

export class FileStorage implements RuntimeStorage {
  private dataDir: string;
  private userDataDir: string;

  constructor({ dataDir, userDataDir }: { dataDir: string; userDataDir: string }) {
    this.dataDir = dataDir;
    this.userDataDir = userDataDir;
  }

  private path(...segments: string[]): string {
    return resolve(this.dataDir, ...segments);
  }

  private userPath(...segments: string[]): string {
    return resolve(this.userDataDir, ...segments);
  }

  // --- AI Entities ---

  async loadAiEntities(gameId: string): Promise<AiEntityRecord[]> {
    return readJsonl<AiEntityRecord>(this.path(`${gameId}/entities.jsonl`));
  }

  async saveAiEntity(record: AiEntityRecord): Promise<void> {
    appendJsonl(this.path(`${record.gameId}/entities.jsonl`), record);
  }

  async getAiEntityIds(gameId: string): Promise<Set<string>> {
    const records = await this.loadAiEntities(gameId);
    return new Set(records.map((r) => r.id));
  }

  async removeAiEntity(gameId: string, entityId: string): Promise<boolean> {
    const filePath = this.path(`${gameId}/entities.jsonl`);
    if (!existsSync(filePath)) return false;
    const lines = readFileSync(filePath, "utf-8").trim().split("\n");
    const filtered = lines.filter((line) => {
      const record = JSON.parse(line) as AiEntityRecord;
      return record.id !== entityId;
    });
    if (filtered.length === lines.length) return false;
    writeFileSync(filePath, filtered.length > 0 ? filtered.join("\n") + "\n" : "");
    return true;
  }

  // --- AI Handlers ---

  async loadAiHandlers(gameId: string): Promise<AiHandlerRecord[]> {
    return readJsonl<AiHandlerRecord>(this.path(`${gameId}/handlers.jsonl`));
  }

  async saveHandler(record: AiHandlerRecord): Promise<void> {
    appendJsonl(this.path(`${record.gameId}/handlers.jsonl`), record);
  }

  async listHandlers(gameId: string): Promise<AiHandlerRecord[]> {
    return this.loadAiHandlers(gameId);
  }

  async removeHandler(gameId: string, name: string): Promise<boolean> {
    const filePath = this.path(`${gameId}/handlers.jsonl`);
    if (!existsSync(filePath)) return false;
    const lines = readFileSync(filePath, "utf-8").trim().split("\n");
    const filtered = lines.filter((line) => {
      const record = JSON.parse(line) as AiHandlerRecord;
      return record.name !== name;
    });
    if (filtered.length === lines.length) return false;
    writeFileSync(filePath, filtered.length > 0 ? filtered.join("\n") + "\n" : "");
    return true;
  }

  // --- Event Log (per-user) ---

  async loadEvents(session: SessionKey): Promise<EventLogEntry[]> {
    return readJsonl<EventLogEntry>(
      this.userPath(`event-log-${session.gameId}-${session.userId}.jsonl`),
    );
  }

  async appendEvent(session: SessionKey, entry: EventLogEntry): Promise<void> {
    appendJsonl(this.userPath(`event-log-${session.gameId}-${session.userId}.jsonl`), entry);
  }

  async clearEvents(session: SessionKey): Promise<void> {
    const filePath = this.userPath(`event-log-${session.gameId}-${session.userId}.jsonl`);
    if (existsSync(filePath)) {
      writeFileSync(filePath, "");
    }
  }

  async popEvent(session: SessionKey): Promise<EventLogEntry | null> {
    const entries = await this.loadEvents(session);
    if (entries.length === 0) return null;
    const popped = entries.pop()!;
    const filePath = this.userPath(`event-log-${session.gameId}-${session.userId}.jsonl`);
    ensureDir(filePath);
    if (entries.length === 0) {
      writeFileSync(filePath, "");
    } else {
      writeFileSync(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    }
    return popped;
  }

  // --- Conversations (per-user) ---

  async loadConversationEntries(gameId: string, npcId: string): Promise<WordEntryRecord[]> {
    const safeId = npcId.replace(/:/g, "_");
    return readJsonl<WordEntryRecord>(this.path("npc", gameId, `${safeId}.jsonl`));
  }

  async saveWordEntry(record: WordEntryRecord): Promise<void> {
    const safeId = record.npcId.replace(/:/g, "_");
    appendJsonl(this.path("npc", record.gameId, `${safeId}.jsonl`), record);
  }

  // --- Users ---

  async findUserByGoogleId(googleId: string): Promise<UserRecord | null> {
    const users = readJsonl<UserRecord>(this.userPath("users.jsonl"));
    return users.find((u) => u.googleId === googleId) || null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const users = readJsonl<UserRecord>(this.userPath("users.jsonl"));
    return users.find((u) => u.id === id) || null;
  }

  async findUserByName(name: string): Promise<UserRecord | null> {
    const users = readJsonl<UserRecord>(this.userPath("users.jsonl"));
    return users.find((u) => u.displayName === name) || null;
  }

  async hasAnyUsers(): Promise<boolean> {
    const users = readJsonl<UserRecord>(this.userPath("users.jsonl"));
    return users.length > 0;
  }

  async createUser(record: UserRecord): Promise<void> {
    appendJsonl(this.userPath("users.jsonl"), record);
  }

  async updateLastLogin(userId: string): Promise<void> {
    const filePath = this.userPath("users.jsonl");
    if (!existsSync(filePath)) return;
    const lines = readFileSync(filePath, "utf-8").trim().split("\n");
    const updated = lines.map((line) => {
      const record = JSON.parse(line) as UserRecord;
      if (record.id === userId) {
        return JSON.stringify({ ...record, lastLoginAt: new Date().toISOString() });
      }
      return line;
    });
    writeFileSync(filePath, updated.join("\n") + "\n");
  }

  // --- Bug Reports (no-op for local dev) ---

  async saveBugReport(_report: BugReport): Promise<void> {}
  async listBugReports(_opts?: { status?: string; gameId?: string }): Promise<BugReport[]> {
    return [];
  }
  async getBugReport(_id: string): Promise<BugReport | null> {
    return null;
  }
  async updateBugReport(_id: string, _update: BugReportUpdate): Promise<void> {}

  // --- AI Usage Quota (no-op for local dev) ---

  async recordAiUsage(_userId: string, _callType: string): Promise<void> {
    // No quota enforcement in local dev
  }

  async countAiUsage(_userId: string, _since: string): Promise<number> {
    return 0;
  }

  // --- Image Settings (JSON file-based for local dev) ---

  private imageSettingsPath(gameId: string): string {
    return resolve(this.dataDir, gameId, "image-settings.json");
  }
  private worldImagesPath(gameId: string): string {
    return resolve(this.dataDir, gameId, "world-images.json");
  }

  async getImageSettings(gameId: string): Promise<ImageSettings | null> {
    const path = this.imageSettingsPath(gameId);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8")) as ImageSettings;
  }

  async saveImageSettings(settings: ImageSettingsInput): Promise<void> {
    const path = this.imageSettingsPath(settings.gameId);
    ensureDir(path);
    const record: ImageSettings = { ...settings, updatedAt: new Date().toISOString() };
    writeFileSync(path, JSON.stringify(record, null, 2));
  }

  async getWorldImage(query: {
    gameId: string;
    imageType: string;
  }): Promise<WorldImageRecord | null> {
    const images = await this.listWorldImages(query.gameId);
    return images.find((i) => i.imageType === query.imageType) || null;
  }

  async saveWorldImage(record: WorldImageRecord): Promise<void> {
    const images = await this.listWorldImages(record.gameId);
    const filtered = images.filter((i) => i.imageType !== record.imageType);
    filtered.push(record);
    const path = this.worldImagesPath(record.gameId);
    ensureDir(path);
    writeFileSync(path, JSON.stringify(filtered, null, 2));
  }

  async deleteWorldImage(query: { gameId: string; imageType: string }): Promise<void> {
    const images = await this.listWorldImages(query.gameId);
    const filtered = images.filter((i) => i.imageType !== query.imageType);
    const path = this.worldImagesPath(query.gameId);
    ensureDir(path);
    writeFileSync(path, JSON.stringify(filtered, null, 2));
  }

  async listWorldImages(gameId: string): Promise<WorldImageRecord[]> {
    const path = this.worldImagesPath(gameId);
    if (!existsSync(path)) return [];
    return JSON.parse(readFileSync(path, "utf-8")) as WorldImageRecord[];
  }
}
