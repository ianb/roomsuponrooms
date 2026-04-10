import t from "tap";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../src/games/test-world.js";
import { getGame } from "../src/games/registry.js";
import { FileStorage } from "../src/server/storage-file.js";
import { buildSessionContextMessage } from "../src/server/agent-session-context.js";

function makeFixture() {
  const dataDir = mkdtempSync(join(tmpdir(), "rur-ctx-test-"));
  const userDataDir = mkdtempSync(join(tmpdir(), "rur-ctx-test-user-"));
  const storage = new FileStorage({ dataDir, userDataDir });
  const def = getGame("test")!;
  const game = def.create();
  return {
    storage,
    game,
    cleanup: () => {
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

t.test("session context message includes player, room, request", async (t) => {
  const { storage, game, cleanup } = makeFixture();
  t.teardown(cleanup);

  const message = await buildSessionContextMessage(game.store, {
    storage,
    gameId: "test",
    userId: "u-1",
    request: "build a puzzle here",
  });

  t.match(message, /<player-context>/, "player section present");
  t.match(message, /<current-room>/, "current room section present");
  t.match(message, /<request>/, "request section present");
  t.match(message, /build a puzzle here/, "request body included");

  // Player ids quoted
  t.match(message, /"player:1"|"player"/, "player id quoted");
  // Room ids quoted
  t.match(message, /"room:clearing"/, "room id quoted");
});

t.test("session context current-room includes children and neighbors", async (t) => {
  const { storage, game, cleanup } = makeFixture();
  t.teardown(cleanup);

  const message = await buildSessionContextMessage(game.store, {
    storage,
    gameId: "test",
    userId: "u-1",
    request: "test",
  });

  // Extract the JSON between <current-room> tags
  const match = /<current-room>\n([\s\S]*?)\n<\/current-room>/.exec(message);
  t.ok(match, "current-room section parses");
  if (!match) return;
  const room = JSON.parse(match[1]!) as {
    id: string;
    children: Array<{ id: string; name: string; tags: string[] }>;
    neighbors: Array<{ via: { direction: string }; room: { id: string } }>;
  };
  t.equal(room.id, "room:clearing");
  t.ok(Array.isArray(room.children), "children array");
  t.ok(Array.isArray(room.neighbors), "neighbors array");
});

t.test("session context recent-events absent when no events", async (t) => {
  const { storage, game, cleanup } = makeFixture();
  t.teardown(cleanup);

  const message = await buildSessionContextMessage(game.store, {
    storage,
    gameId: "test",
    userId: "u-1",
    request: "test",
  });
  t.notMatch(message, /<recent-events>/, "no recent-events section when log is empty");
});

t.test("session context recent-events shows last entries", async (t) => {
  const { storage, game, cleanup } = makeFixture();
  t.teardown(cleanup);

  // Seed three events for the user.
  const session = { gameId: "test", userId: "u-1" };
  await storage.appendEvent(session, {
    command: "go north",
    events: [
      { type: "set-property", entityId: "player:1", description: "Moved player to room:woods." },
    ],
    timestamp: "2026-04-09T00:00:00Z",
  });
  await storage.appendEvent(session, {
    command: "take key",
    events: [{ type: "set-property", entityId: "item:key", description: "Picked up the key." }],
    timestamp: "2026-04-09T00:00:01Z",
  });
  await storage.appendEvent(session, {
    command: "look",
    events: [],
    timestamp: "2026-04-09T00:00:02Z",
  });

  const message = await buildSessionContextMessage(game.store, {
    storage,
    gameId: "test",
    userId: "u-1",
    request: "test",
  });

  t.match(message, /<recent-events>/, "recent-events section present");
  t.match(message, /go north/);
  t.match(message, /take key/);
  t.match(message, /look/);
  t.match(message, /just now/, "most recent labeled 'just now'");
  t.match(message, /Moved player to room:woods\./, "event description included");
});
