import t from "tap";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../src/games/test-world.js";
import { getGame } from "../src/games/registry.js";
import { FileStorage } from "../src/server/storage-file.js";
import { setStorage } from "../src/server/storage-instance.js";
import { runPlaytest } from "../src/server/agent-tool-playtest.js";
import type { ToolContext } from "../src/server/agent-tool-context.js";

async function makeContext(): Promise<{
  context: ToolContext;
  cleanup: () => void;
}> {
  const dataDir = mkdtempSync(join(tmpdir(), "rur-playtest-test-"));
  const userDataDir = mkdtempSync(join(tmpdir(), "rur-playtest-test-user-"));
  const storage = new FileStorage({ dataDir, userDataDir });
  setStorage(storage);
  const def = getGame("test")!;
  const game = def.create();
  const context: ToolContext = {
    storage,
    gameId: "test",
    userId: "u-1",
    sessionId: "s-test",
    store: game.store,
    verbs: game.verbs,
    pendingEdits: [],
    savedVars: {},
    terminate: null,
  };
  return {
    context,
    cleanup: () => {
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

t.test("playtest runs a simple command sequence", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await runPlaytest(context, {
    commands: ["look"],
  });
  t.equal(result.ok, true);
  if (result.ok) {
    t.equal(result.steps.length, 1);
    t.equal(result.steps[0]!.command, "look");
    t.ok(result.steps[0]!.output.length > 0, "look produces output");
    t.ok(result.finalState.playerLocation, "finalState has player location");
  }
});

t.test("playtest setup moves the player and inventory", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  // The test world starts with the player in some default room. Move them
  // to room:clearing and put a pretend item in their inventory by setting
  // location.
  // First we need to find a real entity to move into inventory; the test
  // world has rooms but no items, so we just verify the player move.
  const result = await runPlaytest(context, {
    setup: [{ entityId: "player:1", property: "location", value: "room:clearing" }],
    commands: ["look"],
  });
  t.equal(result.ok, true);
  if (result.ok) {
    t.equal(result.finalState.playerLocation, "room:clearing");
    t.equal(result.finalState.currentRoom.id, "room:clearing");
  }
});

t.test("playtest unhandled command surfaces as outcome:unhandled", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await runPlaytest(context, {
    commands: ["fizzbuzz the moon"],
  });
  t.equal(result.ok, true);
  if (result.ok) {
    const step = result.steps[0]!;
    // "fizzbuzz the moon" doesn't parse as a normal command — most likely
    // outcome is unhandled or unresolved.
    t.ok(
      step.outcome === "unhandled" || step.outcome === "unresolved",
      `outcome is ${step.outcome}`,
    );
  }
});

t.test("playtest reports the handler that ran for performed commands", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await runPlaytest(context, {
    commands: ["look"],
  });
  t.equal(result.ok, true);
  if (result.ok) {
    const step = result.steps[0]!;
    if (step.outcome === "performed") {
      t.ok(step.handler, "performed step has handler name");
    }
  }
});

t.test("playtest does not affect the agent's view", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  // Capture the player's location BEFORE playtest moves them
  const before = context.store.findByTag("player")[0]!.location;

  await runPlaytest(context, {
    setup: [{ entityId: "player:1", property: "location", value: "room:woods" }],
    commands: ["look"],
  });

  // The agent's own store should be UNCHANGED — playtest is hermetic.
  const after = context.store.findByTag("player")[0]!.location;
  t.equal(after, before, "agent's store unchanged after playtest");
});

t.test("playtest setup with missing entity returns an error", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await runPlaytest(context, {
    setup: [{ entityId: "item:does-not-exist", property: "location", value: "room:clearing" }],
    commands: ["look"],
  });
  t.equal(result.ok, false);
  if (!result.ok) {
    t.match(result.error, /does-not-exist|not found/i);
  }
});

t.test("playtest captures finalState after multiple commands", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await runPlaytest(context, {
    setup: [{ entityId: "player:1", property: "location", value: "room:clearing" }],
    commands: ["look", "look"],
  });
  t.equal(result.ok, true);
  if (result.ok) {
    t.equal(result.steps.length, 2);
    t.equal(result.finalState.playerLocation, "room:clearing");
    t.ok(Array.isArray(result.finalState.playerInventory));
  }
});
