import t from "tap";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../src/games/test-world.js";
import { getGame } from "../src/games/registry.js";
import { FileStorage } from "../src/server/storage-file.js";
import type { ToolContext } from "../src/server/agent-tool-context.js";
import { buildAgentTools } from "../src/server/agent-tools.js";
import { applyEditBatch } from "../src/server/agent-tool-edits.js";
import { runQuery } from "../src/server/agent-tool-query.js";

async function makeContext(): Promise<{
  context: ToolContext;
  cleanup: () => void;
}> {
  const dataDir = mkdtempSync(join(tmpdir(), "rur-tools-test-"));
  const userDataDir = mkdtempSync(join(tmpdir(), "rur-tools-test-user-"));
  const storage = new FileStorage({ dataDir, userDataDir });
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
  await storage.createAgentSession({
    id: "s-test",
    gameId: "test",
    userId: "u-1",
    request: "test",
    status: "running",
    messages: [],
    savedVars: {},
    turnCount: 0,
    turnLimit: 10,
    summary: null,
    revertOf: null,
    createdAt: "2026-04-09T00:00:00Z",
    updatedAt: "2026-04-09T00:00:00Z",
    finishedAt: null,
  });
  return {
    context,
    cleanup: () => {
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

t.test("apply_edits creates an entity, visible to next query", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await applyEditBatch(context, {
    edits: [
      {
        entity: {
          id: "item:test-lantern",
          create: {
            tags: ["portable"],
            name: "Test Lantern",
            description: "A test lantern.",
            location: "room:clearing",
          },
        },
      },
    ],
  });
  t.equal(result.ok, true);
  if (result.ok) {
    t.equal(result.applied, 1);
    t.equal(result.edits[0]!.id, "item:test-lantern");
  }

  const queryResult = await runQuery(context, { kind: "get", id: "item:test-lantern" });
  t.equal(queryResult.ok, true);
  if (queryResult.ok) {
    const view = queryResult.result as { name: string };
    t.equal(view.name, "Test Lantern");
  }

  t.equal(context.pendingEdits.length, 1);
});

t.test("apply_edits rejects whole batch on validation failure", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await applyEditBatch(context, {
    edits: [
      {
        entity: {
          id: "item:good-thing",
          create: {
            tags: ["portable"],
            name: "Good",
            description: "Fine.",
            location: "room:clearing",
          },
        },
      },
      {
        entity: {
          id: "item:bad-thing",
          create: {
            tags: ["portable"],
            name: "Bad",
            description: "Bad.",
            location: "room:nonexistent",
          },
        },
      },
    ],
  });
  t.equal(result.ok, false);
  if (!result.ok) {
    t.equal(result.failures.length, 1);
    t.match(result.failures[0]!.reason, /unknown location/);
  }
  // Nothing should have been appended.
  t.equal(context.pendingEdits.length, 0);
  // First edit must NOT have leaked into the live store.
  t.notOk(context.store.has("item:good-thing"));
});

t.test("apply_edits rolls back on apply error and persists nothing", async (t) => {
  // Regression: in tinkermarket session s-mSduDmWL22, the agent emitted a
  // create with `properties: { portable: true }` which triggered
  // UndefinedPropertyError inside store.create. The previous implementation
  // had already appended the entire batch to the log before applying, so
  // the bad batch leaked into storage and contaminated future ticks. The
  // fix: apply to a snapshot first, restore on failure, append only on
  // success.
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  // First, a clean batch that creates a valid item.
  const ok1 = await applyEditBatch(context, {
    edits: [
      {
        entity: {
          id: "item:lantern-a",
          create: {
            tags: ["portable"],
            name: "Lantern A",
            description: "First lantern.",
            location: "room:clearing",
          },
        },
      },
    ],
  });
  t.equal(ok1.ok, true);
  t.equal(context.pendingEdits.length, 1);

  // Now a batch with one good edit and one that will throw at apply time
  // (unknown property name). The good edit should NOT have been persisted.
  const bad = await applyEditBatch(context, {
    edits: [
      {
        entity: {
          id: "item:lantern-b",
          create: {
            tags: ["portable"],
            name: "Lantern B",
            description: "Second lantern.",
            location: "room:clearing",
          },
        },
      },
      {
        entity: {
          id: "item:lantern-c",
          create: {
            tags: ["portable"],
            name: "Lantern C",
            description: "Third lantern.",
            location: "room:clearing",
            properties: { totally_unknown_property: 42 },
          },
        },
      },
    ],
  });
  t.equal(bad.ok, false);

  // Pending edits should still be just the original 1 — the failed batch
  // must not have leaked any new entries.
  t.equal(context.pendingEdits.length, 1, "failed batch did not leak edits");

  // The half-applied lantern-b must NOT be in the store either.
  t.notOk(context.store.has("item:lantern-b"), "snapshot rollback removed lantern-b");
  // lantern-a from the first batch is still there.
  t.ok(context.store.has("item:lantern-a"));
});

t.test("apply_edits rejects update of nonexistent entity", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await applyEditBatch(context, {
    edits: [
      {
        entity: {
          id: "item:does-not-exist",
          value: { name: "Phantom" },
        },
      },
    ],
  });
  t.equal(result.ok, false);
});

t.test("apply_edits rejects create with multiple operations", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  // Manually call normalizer through applyEditBatch — Zod allows the union
  // because we expressed it as a single object with optional ops; we catch
  // multi-op locally.
  const result = await applyEditBatch(context, {
    edits: [
      {
        entity: {
          id: "item:two-ops",
          create: {
            tags: ["portable"],
            name: "Confused",
            description: "Two ops.",
            location: "room:clearing",
          },
          delete: true,
        },
      },
    ],
  });
  t.equal(result.ok, false);
  if (!result.ok) {
    t.match(result.failures[0]!.reason, /multiple operations/);
  }
});

t.test("query get with exact id returns single GetView", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await runQuery(context, { kind: "get", id: "room:clearing" });
  t.equal(result.ok, true);
  if (result.ok) {
    const view = result.result as { id: string; name: string; containedBy: string[] };
    t.equal(view.id, "room:clearing");
    t.ok(Array.isArray(view.containedBy), "containedBy chain present");
  }
});

t.test("query get with wildcard returns array of matching entities", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await runQuery(context, { kind: "get", id: "room:*" });
  t.equal(result.ok, true);
  if (result.ok) {
    const list = result.result as Array<{ id: string; tags: string[] }>;
    t.ok(Array.isArray(list));
    t.ok(list.length > 0);
    t.ok(list.every((r) => r.id.startsWith("room:")));
  }
});

t.test("query get withChildren includes direct contents", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await runQuery(context, {
    kind: "get",
    id: "room:clearing",
    withChildren: true,
  });
  t.equal(result.ok, true);
  if (result.ok) {
    const view = result.result as { children: Array<{ id: string; tags: string[] }> };
    t.ok(Array.isArray(view.children));
  }
});

t.test("query get withNeighborhood includes reachable rooms", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await runQuery(context, {
    kind: "get",
    id: "room:clearing",
    withNeighborhood: true,
  });
  t.equal(result.ok, true);
  if (result.ok) {
    const view = result.result as {
      neighbors: Array<{ via: { direction: string }; room: { id: string } }>;
    };
    t.ok(Array.isArray(view.neighbors));
    t.ok(view.neighbors.length > 0, "test world has reachable neighbors from clearing");
  }
});

t.test("query entities returns every entity with containedBy chain", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await runQuery(context, { kind: "entities" });
  t.equal(result.ok, true);
  if (result.ok) {
    const list = result.result as Array<{ id: string; containedBy: string[] }>;
    t.ok(Array.isArray(list));
    t.ok(list.some((e) => e.id === "room:clearing"));
    // Every entity should have a containedBy field (possibly empty for the root)
    t.ok(list.every((e) => Array.isArray(e.containedBy)));
  }
});

t.test("query exits get a destinationName field", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await runQuery(context, {
    kind: "get",
    id: "exit:*",
    jq: "[.[] | select(.destination != null)]",
  });
  t.equal(result.ok, true);
  if (result.ok) {
    const list = result.result as Array<{ destinationName: string | null }>;
    t.ok(Array.isArray(list));
    if (list.length > 0) {
      t.ok(list[0]!.destinationName !== undefined, "destinationName field present");
    }
  }
});

t.test("query contains filter narrows array results", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await runQuery(context, { kind: "entities", contains: "clearing" });
  t.equal(result.ok, true);
  if (result.ok) {
    const list = result.result as Array<{ id: string }>;
    t.ok(Array.isArray(list));
    t.ok(list.some((e) => e.id === "room:clearing"));
  }
});

t.test("query inline jq projects the result", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await runQuery(context, {
    kind: "entities",
    jq: '[.[] | select(.tags | index("room")) | .id]',
  });
  t.equal(result.ok, true);
  if (result.ok) {
    const ids = result.result as string[];
    t.ok(Array.isArray(ids));
    t.ok(ids.includes("room:clearing"));
  }
});

t.test("query saveAs persists the result to the scratchpad", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await runQuery(context, { kind: "entities", saveAs: "all" });
  t.equal(result.ok, true);
  if (result.ok) t.equal(result.savedAs, "all");
  t.ok(context.savedVars["all"]);
});

t.test("query handlers returns the live verb registry", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await runQuery(context, { kind: "handlers" });
  t.equal(result.ok, true);
  if (result.ok) {
    const list = result.result as Array<{ name: string; verb: string }>;
    t.ok(Array.isArray(list));
    t.ok(list.length > 0, "registry is non-empty");
  }
});

t.test("query events returns the per-user event log", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  // Seed an event so loadEvents has something to return.
  await context.storage.appendEvent(
    { gameId: "test", userId: "u-1" },
    {
      command: "look",
      events: [{ type: "noop", entityId: "room:clearing", description: "Looked around." }],
      timestamp: "2026-04-09T00:00:00Z",
    },
  );

  const result = await runQuery(context, { kind: "events" });
  t.equal(result.ok, true);
  if (result.ok) {
    const list = result.result as Array<{
      command: string;
      changes: Array<{ description: string }>;
    }>;
    t.equal(list.length, 1);
    t.equal(list[0]!.command, "look");
  }
});

t.test("save_var and get_var round-trip via the bundled tools", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);
  const tools = buildAgentTools(context);

  const saveResult = (await tools.save_var.execute!(
    { name: "rooms", value: ["room:clearing"] },
    { toolCallId: "1", messages: [] },
  )) as { ok: boolean };
  t.equal(saveResult.ok, true);
  t.same(context.savedVars["rooms"], ["room:clearing"]);

  const getResult = (await tools.get_var.execute!(
    { name: "rooms" },
    { toolCallId: "2", messages: [] },
  )) as { ok: boolean; value?: unknown };
  t.equal(getResult.ok, true);
  t.same(getResult.value, ["room:clearing"]);
});

t.test("finish sets terminate flag", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);
  const tools = buildAgentTools(context);

  await tools.finish.execute!({ summary: "all done" }, { toolCallId: "1", messages: [] });
  t.same(context.terminate, { kind: "finish", summary: "all done" });
});

t.test("bail sets terminate flag", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);
  const tools = buildAgentTools(context);

  await tools.bail.execute!({ reason: "stuck" }, { toolCallId: "1", messages: [] });
  t.same(context.terminate, { kind: "bail", summary: "stuck" });
});
