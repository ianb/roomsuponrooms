import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import t from "tap";
import "../src/games/test-world.js";
import { FileStorage } from "../src/server/storage-file.js";
import { setStorage, getStorage } from "../src/server/storage-instance.js";
import { getOrCreateGame } from "../src/server/router.js";
import { setKnownEventCount } from "../src/server/event-count.js";
import { applyAiEntityRecords } from "../src/server/apply-ai-records.js";
import { getGame } from "../src/games/registry.js";
import type { SessionKey, EventLogEntry } from "../src/server/storage.js";

function moveEntry(destination: string): EventLogEntry {
  return {
    command: "go somewhere",
    events: [
      {
        type: "set-property",
        entityId: "player:1",
        property: "location",
        value: destination,
        description: "Moved",
      },
    ],
    timestamp: new Date().toISOString(),
  };
}

t.test("cached game survives while the event log is unchanged", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "cache-fresh-"));
  t.teardown(() => rmSync(dir, { recursive: true, force: true }));
  setStorage(new FileStorage({ dataDir: dir, userDataDir: dir }));
  const session: SessionKey = { gameId: "test", userId: "u-fresh" };

  const first = await getOrCreateGame(session);
  const second = await getOrCreateGame(session);
  t.equal(second, first, "same instance returned while no events were appended");
  t.end();
});

t.test("cached game rebuilds when another isolate appends events", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "cache-stale-"));
  t.teardown(() => rmSync(dir, { recursive: true, force: true }));
  setStorage(new FileStorage({ dataDir: dir, userDataDir: dir }));
  const session: SessionKey = { gameId: "test", userId: "u-stale" };

  const cached = await getOrCreateGame(session);
  t.equal(cached.store.get("player:1").location, "room:clearing", "starts in the clearing");

  // Simulate a foreign isolate's write: append a movement event, then reset
  // the local known count to what it was before the append (a real foreign
  // isolate never touches this isolate's counter).
  await getStorage().appendEvent(session, moveEntry("room:deep-woods"));
  setKnownEventCount(session, 0);

  const rebuilt = await getOrCreateGame(session);
  t.not(rebuilt, cached, "stale instance was rebuilt");
  t.equal(
    rebuilt.store.get("player:1").location,
    "room:deep-woods",
    "rebuilt world replayed the foreign event",
  );

  const again = await getOrCreateGame(session);
  t.equal(again, rebuilt, "rebuilt instance is cached and stays fresh");
  t.end();
});

t.test("own appends do not invalidate the cache", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "cache-own-"));
  t.teardown(() => rmSync(dir, { recursive: true, force: true }));
  setStorage(new FileStorage({ dataDir: dir, userDataDir: dir }));
  const session: SessionKey = { gameId: "test", userId: "u-own" };

  const cached = await getOrCreateGame(session);
  // An append in this isolate bumps the known count via the storage layer,
  // matching what executeCommand does after applying events in memory.
  await getStorage().appendEvent(session, moveEntry("room:deep-woods"));

  const after = await getOrCreateGame(session);
  t.equal(after, cached, "cache stays valid after a local append");
  t.end();
});

t.test("applyAiEntityRecords never applies player records", (t) => {
  const def = getGame("test");
  if (!def) {
    t.fail("test game not registered");
    t.end();
    return;
  }
  const { store } = def.create();
  applyAiEntityRecords(
    [
      {
        id: "player:1",
        tags: ["player"],
        name: "Stale Player",
        description: "",
        location: "room:deep-woods",
        scenery: [{ word: "light", description: "stale", rejection: "no" }],
        gameId: "test",
        createdAt: new Date().toISOString(),
        authoring: { createdBy: "test", creationSource: "test" },
      },
    ],
    store,
  );
  const player = store.get("player:1");
  t.equal(player.location, "room:clearing", "player location untouched");
  t.equal(player.name, "You", "player name untouched");
  t.equal(player.scenery.length, 0, "no scenery attached to the player");
  t.end();
});
