import t from "tap";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../src/games/test-world.js";
import { getGame } from "../src/games/registry.js";
import { FileStorage } from "../src/server/storage-file.js";
import { emptyAgentTokenUsage } from "../src/server/storage.js";
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
    editsSinceLastPlaytest: false,
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
    model: null,
    systemPrompt: null,
    tokenUsage: emptyAgentTokenUsage(),
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
        target: "item:test-lantern",
        entityCreate: {
          tags: ["portable"],
          name: "Test Lantern",
          description: "A test lantern.",
          location: "room:clearing",
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
        target: "item:good-thing",
        entityCreate: {
          tags: ["portable"],
          name: "Good",
          description: "Fine.",
          location: "room:clearing",
        },
      },
      {
        target: "item:bad-thing",
        entityCreate: {
          tags: ["portable"],
          name: "Bad",
          description: "Bad.",
          location: "room:nonexistent",
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
        target: "item:lantern-a",
        entityCreate: {
          tags: ["portable"],
          name: "Lantern A",
          description: "First lantern.",
          location: "room:clearing",
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
        target: "item:lantern-b",
        entityCreate: {
          tags: ["portable"],
          name: "Lantern B",
          description: "Second lantern.",
          location: "room:clearing",
        },
      },
      {
        target: "item:lantern-c",
        entityCreate: {
          tags: ["portable"],
          name: "Lantern C",
          description: "Third lantern.",
          location: "room:clearing",
          properties: { totally_unknown_property: 42 },
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
        target: "item:does-not-exist",
        entityUpdate: { name: "Phantom" },
      },
    ],
  });
  t.equal(result.ok, false);
});

t.test("apply_edits rejects edit with multiple operations", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  // Schema allows all op fields as optional; we catch multi-op at the
  // normalizer.
  const result = await applyEditBatch(context, {
    edits: [
      {
        target: "item:two-ops",
        entityCreate: {
          tags: ["portable"],
          name: "Confused",
          description: "Two ops.",
          location: "room:clearing",
        },
        entityDelete: true,
      },
    ],
  });
  t.equal(result.ok, false);
  if (!result.ok) {
    t.match(result.failures[0]!.reason, /set 2 operation fields|exactly one/);
  }
});

t.test("apply_edits rejects edit with no operation set", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await applyEditBatch(context, {
    edits: [{ target: "item:nothing" }],
  });
  t.equal(result.ok, false);
  if (!result.ok) {
    t.match(result.failures[0]!.reason, /must set exactly one/);
  }
});

t.test("apply_edits handler create + update with the new flat shape", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const create = await applyEditBatch(context, {
    edits: [
      {
        target: "ai-test-shout",
        handlerCreate: {
          pattern: { verb: "shout", form: "intransitive" },
          perform: 'return { output: "echoes!", events: [] };',
        },
      },
    ],
  });
  t.equal(create.ok, true);
  if (create.ok) t.equal(create.edits[0]!.kind, "handler");

  const update = await applyEditBatch(context, {
    edits: [
      {
        target: "ai-test-shout",
        handlerUpdate: {
          perform: 'return { output: "louder echoes!", events: [] };',
        },
      },
    ],
  });
  t.equal(update.ok, true);
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

  // Pass a high limit so the assertion sees the full set, not just the
  // default-paged sample.
  const result = await runQuery(context, { kind: "entities", limit: 200 });
  t.equal(result.ok, true);
  if (result.ok) {
    const list = result.result as Array<{ id: string; containedBy: string[] }>;
    t.ok(Array.isArray(list));
    t.ok(list.some((e) => e.id === "room:clearing"));
    // Every entity should have a containedBy field (possibly empty for the root)
    t.ok(list.every((e) => Array.isArray(e.containedBy)));
  }
});

t.test("query default limit truncates to 5 with omittedCount", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await runQuery(context, { kind: "entities" });
  t.equal(result.ok, true);
  if (result.ok) {
    const list = result.result as unknown[];
    t.equal(list.length, 5, "default limit is 5");
    t.ok(result.totalMatched && result.totalMatched > 5);
    t.ok(result.omittedCount && result.omittedCount > 0);
    t.ok(result.hint, "hint included");
  }
});

t.test("query saveAs suppresses the echoed result and stashes the full set", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  const result = await runQuery(context, { kind: "entities", saveAs: "all" });
  t.equal(result.ok, true);
  if (result.ok) {
    // The response no longer echoes the value back when saveAs is set —
    // the agent gets metadata only, and reads the data later via kind:"var".
    t.equal(result.result, undefined, "result field is suppressed");
    t.equal(result.savedAs, "all");
    t.ok(result.savedSummary, "summary is set");
    t.match(result.savedSummary || "", /array of \d+ items/);
    t.ok(result.totalMatched && result.totalMatched > 5);
    t.ok(result.hint, "hint explains how to read the variable back");
    t.match(result.hint || "", /kind:"var"/);
    // Scratchpad has the full set.
    const stored = context.savedVars["all"] as unknown[];
    t.ok(Array.isArray(stored));
    t.ok(stored.length > 5, "scratchpad has untruncated set");
  }
});

t.test("query kind:var reads back a saved variable, with optional jq", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);

  // Stash the full entities corpus.
  const saveResult = await runQuery(context, { kind: "entities", saveAs: "all" });
  t.equal(saveResult.ok, true);

  // Read it back with kind:"var".
  const readResult = await runQuery(context, { kind: "var", name: "all" });
  t.equal(readResult.ok, true);
  if (readResult.ok) {
    t.ok(Array.isArray(readResult.result));
  }

  // Read it back with a jq filter to project just ids and tags.
  const projected = await runQuery(context, {
    kind: "var",
    name: "all",
    jq: "[.[] | {id, tags}]",
    limit: 3,
  });
  t.equal(projected.ok, true);
  if (projected.ok) {
    const list = projected.result as Array<{ id: string; tags: string[] }>;
    t.equal(list.length, 3);
    t.ok(list[0]!.id);
    t.ok(Array.isArray(list[0]!.tags));
  }

  // Missing variable produces a clear error.
  const missing = await runQuery(context, { kind: "var", name: "no-such-var" });
  t.equal(missing.ok, false);
  if (!missing.ok) {
    t.match(missing.error, /no-such-var/);
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

t.test("save_var stores a value; query kind:var reads it back", async (t) => {
  const { context, cleanup } = await makeContext();
  t.teardown(cleanup);
  const tools = buildAgentTools(context);

  const saveResult = (await tools.save_var.execute!(
    { name: "rooms", value: ["room:clearing"] },
    { toolCallId: "1", messages: [] },
  )) as { ok: boolean };
  t.equal(saveResult.ok, true);
  t.same(context.savedVars["rooms"], ["room:clearing"]);

  const getResult = await runQuery(context, { kind: "var", name: "rooms" });
  t.equal(getResult.ok, true);
  if (getResult.ok) {
    t.same(getResult.result, ["room:clearing"]);
  }
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
