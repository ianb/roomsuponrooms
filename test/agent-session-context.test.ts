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

t.test("session context current-room is a compact text summary, not JSON", async (t) => {
  const { storage, game, cleanup } = makeFixture();
  t.teardown(cleanup);

  const message = await buildSessionContextMessage(game.store, {
    storage,
    gameId: "test",
    userId: "u-1",
    request: "test",
  });

  const match = /<current-room>\n([\s\S]*?)\n<\/current-room>/.exec(message);
  t.ok(match, "current-room section present");
  if (!match) return;
  const body = match[1]!;
  // The new format is human-readable text. It must NOT be valid JSON, and it
  // must not bury the room id inside a sea of nested arrays the way the old
  // JSON dump did.
  t.throws(() => JSON.parse(body), "body is text, not JSON");
  t.match(body, /Room "room:clearing"/, "room header includes id");
  t.match(body, /Children \(/, "children section is summarized");
  // Test world has at least one exit out of room:clearing — neighbors should
  // be listed.
  t.match(body, /Neighbors \(/, "neighbors section is summarized");
  // The footer must teach the agent how to recover the data we left out.
  t.match(body, /query\(\{kind:"get"/, "footer shows the query call to read more");
  // Sanity: don't accidentally dump the entire description verbatim — the
  // whole point of the rewrite is to keep this section short. Cap at ~2KB
  // for the test world.
  t.ok(body.length < 2000, `room block is concise (${body.length} bytes)`);
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
