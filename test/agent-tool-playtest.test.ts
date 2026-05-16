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

t.test("playtest step includes a parse string with entity ids for performed commands", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await runPlaytest(context, {
    setup: [{ entityId: "player:1", property: "location", value: "room:clearing" }],
    commands: ["examine lantern"],
  });
  t.equal(result.ok, true);
  if (result.ok) {
    const step = result.steps[0]!;
    t.ok(step.parse, "step has parse field");
    // describeResolved renders as 'verb name [id]'. For 'examine lantern' we
    // expect the lantern entity id to appear in the parse string.
    t.match(step.parse || "", /item:lantern/, "parse string names the resolved entity id");
  }
});

t.test("playtest survives a partial handler update (no-data crash)", async (t) => {
  // Regression: session s-jGwDamNWSZ deadlocked because a handlerUpdate with
  // only `perform` set got re-registered as full HandlerData with undefined
  // pattern, and every subsequent command crashed in the dispatcher with
  // "Cannot read properties of undefined (reading 'verb')". Verify an update
  // of just the perform body leaves pattern/form/etc. intact and dispatch
  // still works.
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  // First, pretend the agent already created a full handler in an earlier
  // batch — this is the prior state a subsequent update would merge onto.
  context.pendingEdits.push({
    seq: -2,
    gameId: "test",
    sessionId: "s-test",
    targetKind: "handler",
    targetId: "test-shout",
    op: "create",
    payload: {
      pattern: { verb: "shout", form: "intransitive" },
      perform: "return { output: 'You shout.', events: [] };",
    },
    priorState: null,
    applied: false,
    createdAt: new Date().toISOString(),
  });
  // Then a partial update that ONLY changes the perform body. Previously this
  // would corrupt the handler record.
  context.pendingEdits.push({
    seq: -1,
    gameId: "test",
    sessionId: "s-test",
    targetKind: "handler",
    targetId: "test-shout",
    op: "update",
    payload: {
      perform: "return { output: 'You bellow.', events: [] };",
    },
    priorState: null,
    applied: false,
    createdAt: new Date().toISOString(),
  });

  const result = await runPlaytest(context, {
    setup: [{ entityId: "player:1", property: "location", value: "room:clearing" }],
    commands: ["look", "shout"],
  });
  t.equal(result.ok, true);
  if (result.ok) {
    // The first step (look) used to error with the verb-crash; it must now
    // succeed. The second step exercises the merged handler.
    t.notOk(
      result.steps.some((s) => s.outcome === "error"),
      "no step crashed",
    );
    const shoutStep = result.steps.find((s) => s.command === "shout");
    t.ok(shoutStep);
    if (shoutStep) {
      t.equal(shoutStep.outcome, "performed");
      t.match(shoutStep.output || "", /bellow/, "merged perform body ran");
    }
  }
});

t.test("playtest surfaces candidates on unhandled with rejection reasons", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  // Push a handler into pendingEdits so the playtest sandbox loads it.
  // The handler wants "shout" + intransitive — then we send a transitive
  // "shout X" command. The verb matches but the form doesn't, so dispatch
  // fails and we should see a candidate with "wrong form" reason.
  context.pendingEdits.push({
    seq: -1,
    gameId: "test",
    sessionId: "s-test",
    targetKind: "handler",
    targetId: "test-shout-intransitive",
    op: "create",
    payload: {
      pattern: { verb: "shout", form: "intransitive" },
      perform: "return { output: 'You shout.', events: [] };",
    },
    priorState: null,
    applied: false,
    createdAt: new Date().toISOString(),
  });

  const result = await runPlaytest(context, {
    setup: [{ entityId: "player:1", property: "location", value: "room:clearing" }],
    commands: ["shout lantern"],
  });
  t.equal(result.ok, true);
  if (result.ok) {
    const step = result.steps[0]!;
    t.equal(step.outcome, "unhandled");
    t.ok(step.candidates, "candidates field is set on unhandled");
    if (step.candidates) {
      const shout = step.candidates.find((c) => c.handler === "test-shout-intransitive");
      t.ok(shout, "our shout handler is listed as a candidate");
      if (shout) t.match(shout.reason, /wrong form/, "reason mentions form mismatch");
    }
  }
});

t.test("playtest aborts the command loop on unhandled", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await runPlaytest(context, {
    setup: [{ entityId: "player:1", property: "location", value: "room:clearing" }],
    // Second command should never run because the first is unhandled and the
    // playtest aborts immediately.
    commands: ["fizzbuzz the moon", "look"],
  });
  t.equal(result.ok, true);
  if (result.ok) {
    // We expect exactly one step (the aborting one); the second command is
    // dropped.
    t.equal(result.steps.length, 1, "loop stopped after the failing step");
    t.ok(result.abortedAt, "result has abortedAt marker");
    if (result.abortedAt) {
      t.equal(result.abortedAt.stepIndex, 0);
      t.ok(
        result.abortedAt.reason === "unhandled" || result.abortedAt.reason === "unresolved",
        `reason is ${result.abortedAt.reason}`,
      );
    }
  }
});
