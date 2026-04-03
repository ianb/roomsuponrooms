import { nanoid } from "nanoid";
import type { EntityStore } from "../core/entity.js";
import type { EntitySnapshot } from "../core/entity-types.js";
import type { GameInstance } from "../games/registry.js";
import type { BugReport, EntityChangeRecord, EventLogEntry, SessionKey } from "./storage.js";
import { getStorage } from "./storage-instance.js";

export interface BugPreview {
  description: string;
  gameId: string;
  userId: string;
  userName: string | null;
  roomId: string | null;
  roomName: string | null;
  recentCommands: EventLogEntry[];
  entityChanges: EntityChangeRecord[];
}

function diffSnapshots(
  initial: EntitySnapshot,
  current: EntitySnapshot,
): Array<{ field: string; from: unknown; to: unknown }> {
  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
  if (initial.name !== current.name) {
    changes.push({ field: "name", from: initial.name, to: current.name });
  }
  if (initial.description !== current.description) {
    changes.push({ field: "description", from: initial.description, to: current.description });
  }
  if (initial.location !== current.location) {
    changes.push({ field: "location", from: initial.location, to: current.location });
  }
  // Compare property bags
  const allKeys = new Set([...Object.keys(initial.properties), ...Object.keys(current.properties)]);
  for (const key of allKeys) {
    const oldVal = initial.properties[key];
    const newVal = current.properties[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field: key, from: oldVal, to: newVal });
    }
  }
  return changes;
}

function collectEntityChanges(store: EntityStore): EntityChangeRecord[] {
  const records: EntityChangeRecord[] = [];
  for (const id of store.getAllIds()) {
    const initial = store.getInitialState(id);
    if (!initial) continue;
    const current = store.getSnapshot(id);
    const changes = diffSnapshots(initial, current);
    if (changes.length > 0) {
      records.push({ id, name: current.name, changes });
    }
  }
  return records;
}

export async function collectBugContext(
  game: GameInstance,
  {
    session,
    userName,
    description,
  }: { session: SessionKey; userName: string | null; description: string },
): Promise<BugPreview> {
  const storage = getStorage();
  const events = await storage.loadEvents(session);
  const recentCommands = events.slice(-10);

  const store = game.store;
  const players = store.findByTag("player");
  const player = players[0];
  let roomId: string | null = null;
  let roomName: string | null = null;
  if (player) {
    roomId = player.location;
    if (roomId && store.has(roomId)) {
      roomName = store.get(roomId).name;
    }
  }

  const entityChanges = collectEntityChanges(store);

  return {
    description,
    gameId: session.gameId,
    userId: session.userId,
    userName,
    roomId,
    roomName,
    recentCommands,
    entityChanges,
  };
}

export async function submitBugReport(preview: BugPreview): Promise<BugReport> {
  const id = "b-" + nanoid(8);
  const report: BugReport = {
    id,
    gameId: preview.gameId,
    userId: preview.userId,
    userName: preview.userName,
    description: preview.description,
    roomId: preview.roomId,
    roomName: preview.roomName,
    recentCommands: preview.recentCommands,
    entityChanges: preview.entityChanges,
    status: "new",
    fixCommit: null,
    duplicateOf: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
  await getStorage().saveBugReport(report);
  return report;
}
