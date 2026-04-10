import t from "tap";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStorage } from "../src/server/storage-file.js";
import type {
  AgentSessionRecord,
  NewWorldEditRecord,
  AiEntityRecord,
} from "../src/server/storage.js";
import { emptyAgentTokenUsage } from "../src/server/storage.js";
import type { EntityData } from "../src/core/game-data.js";

function makeStorage(): { storage: FileStorage; cleanup: () => void } {
  const dataDir = mkdtempSync(join(tmpdir(), "rur-agent-test-"));
  const userDataDir = mkdtempSync(join(tmpdir(), "rur-agent-test-user-"));
  const storage = new FileStorage({ dataDir, userDataDir });
  return {
    storage,
    cleanup: () => {
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

function newSession(overrides: Partial<AgentSessionRecord>): AgentSessionRecord {
  const now = "2026-04-09T00:00:00Z";
  return {
    id: "s-test1",
    gameId: "test-game",
    userId: "u-1",
    request: "Build a small puzzle",
    status: "running",
    messages: [],
    savedVars: {},
    turnCount: 0,
    turnLimit: 20,
    summary: null,
    revertOf: null,
    model: null,
    systemPrompt: null,
    tokenUsage: emptyAgentTokenUsage(),
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    ...overrides,
  };
}

function entity(overrides: Partial<EntityData>): EntityData {
  return {
    id: "item:thing",
    tags: ["portable"],
    name: "Thing",
    description: "A thing.",
    location: "room:start",
    ...overrides,
  };
}

function newEdit(overrides: Partial<NewWorldEditRecord>): NewWorldEditRecord {
  return {
    gameId: "test-game",
    sessionId: "s-test1",
    targetKind: "entity",
    targetId: "item:thing",
    op: "create",
    payload: null,
    createdAt: "2026-04-09T00:00:01Z",
    ...overrides,
  };
}

t.test("session round-trip: create, get, update, list", async (t) => {
  const { storage, cleanup } = makeStorage();
  t.teardown(cleanup);

  const session = newSession({});
  await storage.createAgentSession(session);

  const fetched = await storage.getAgentSession(session.id);
  t.ok(fetched);
  t.equal(fetched!.request, "Build a small puzzle");
  t.equal(fetched!.status, "running");

  await storage.updateAgentSession(session.id, {
    turnCount: 5,
    messages: [{ role: "user", content: "hi" }],
  });
  const updated = await storage.getAgentSession(session.id);
  t.equal(updated!.turnCount, 5);
  t.same(updated!.messages, [{ role: "user", content: "hi" }]);

  const listed = await storage.listAgentSessions({ gameId: "test-game" });
  t.equal(listed.length, 1);
  t.equal(listed[0]!.id, session.id);
});

t.test("appendWorldEdit assigns increasing seq", async (t) => {
  const { storage, cleanup } = makeStorage();
  t.teardown(cleanup);

  await storage.createAgentSession(newSession({}));
  const e1 = await storage.appendWorldEdit(newEdit({ payload: entity({}), op: "create" }));
  const e2 = await storage.appendWorldEdit(
    newEdit({
      targetId: "item:other",
      payload: entity({ id: "item:other", name: "Other" }),
      op: "create",
    }),
  );
  t.ok(e1.seq < e2.seq);
  t.equal(e1.applied, false);
  t.equal(e1.priorState, null);

  const all = await storage.getSessionEdits("s-test1");
  t.equal(all.length, 2);
});

t.test("commitSession fans out create edits to entities and marks applied", async (t) => {
  const { storage, cleanup } = makeStorage();
  t.teardown(cleanup);

  await storage.createAgentSession(newSession({}));
  await storage.appendWorldEdit(
    newEdit({
      targetId: "item:lantern",
      op: "create",
      payload: entity({ id: "item:lantern", name: "Lantern" }),
    }),
  );

  await storage.commitSession("s-test1", "Added a lantern");

  // Edit should now be applied.
  const edits = await storage.getSessionEdits("s-test1");
  t.equal(edits[0]!.applied, true);

  // Materialized entity should be present.
  const all = await storage.loadAiEntities("test-game");
  const lantern = all.find((r: AiEntityRecord) => r.id === "item:lantern");
  t.ok(lantern, "lantern entity exists in materialized table");
  t.equal(lantern!.name, "Lantern");
  t.equal(lantern!.authoring.creationSource, "agent");
  t.equal(lantern!.authoring.creationCommand, "s-test1");

  // Session should be flipped to finished.
  const session = await storage.getAgentSession("s-test1");
  t.equal(session!.status, "finished");
  t.equal(session!.summary, "Added a lantern");
});

t.test("commitSession captures prior_state for update over existing entity", async (t) => {
  const { storage, cleanup } = makeStorage();
  t.teardown(cleanup);

  // Pre-populate a materialized entity.
  await storage.saveAiEntity({
    ...entity({ id: "item:lantern", name: "Old Lantern", description: "Dim." }),
    createdAt: "2026-01-01T00:00:00Z",
    gameId: "test-game",
    authoring: {
      createdBy: "u-1",
      creationSource: "manual",
      creationCommand: undefined,
    },
  });

  await storage.createAgentSession(newSession({}));
  await storage.appendWorldEdit(
    newEdit({
      targetId: "item:lantern",
      op: "update",
      payload: { name: "Bright Lantern" },
    }),
  );

  await storage.commitSession("s-test1", "Brightened the lantern");

  const edits = await storage.getSessionEdits("s-test1");
  t.equal(edits[0]!.applied, true);
  const prior = edits[0]!.priorState as EntityData;
  t.equal(prior.name, "Old Lantern", "prior_state captures the pre-update name");

  const all = await storage.loadAiEntities("test-game");
  const lantern = all.find((r: AiEntityRecord) => r.id === "item:lantern");
  t.equal(lantern!.name, "Bright Lantern");
  t.equal(lantern!.description, "Dim.", "untouched fields preserved");
});

t.test("commitSession delete removes entity and captures prior_state", async (t) => {
  const { storage, cleanup } = makeStorage();
  t.teardown(cleanup);

  await storage.saveAiEntity({
    ...entity({ id: "item:doomed", name: "Doomed" }),
    createdAt: "2026-01-01T00:00:00Z",
    gameId: "test-game",
    authoring: { createdBy: "u-1", creationSource: "manual" },
  });

  await storage.createAgentSession(newSession({}));
  await storage.appendWorldEdit(newEdit({ targetId: "item:doomed", op: "delete", payload: null }));

  await storage.commitSession("s-test1", "Removed the doomed item");

  const all = await storage.loadAiEntities("test-game");
  t.notOk(
    all.find((r: AiEntityRecord) => r.id === "item:doomed"),
    "doomed entity is gone",
  );

  const edits = await storage.getSessionEdits("s-test1");
  const prior = edits[0]!.priorState as EntityData;
  t.equal(prior.name, "Doomed");
});

t.test("commitSession create-then-update applies merged final state", async (t) => {
  const { storage, cleanup } = makeStorage();
  t.teardown(cleanup);

  await storage.createAgentSession(newSession({}));
  await storage.appendWorldEdit(
    newEdit({
      targetId: "item:gem",
      op: "create",
      payload: entity({ id: "item:gem", name: "Gem", properties: { weight: 1 } }),
    }),
  );
  await storage.appendWorldEdit(
    newEdit({
      targetId: "item:gem",
      op: "update",
      payload: { properties: { weight: 2, color: "blue" } },
    }),
  );

  await storage.commitSession("s-test1", "Created and tuned the gem");

  const all = await storage.loadAiEntities("test-game");
  const gem = all.find((r: AiEntityRecord) => r.id === "item:gem")!;
  t.equal(gem.name, "Gem");
  t.same(gem.properties, { weight: 2, color: "blue" });

  const edits = await storage.getSessionEdits("s-test1");
  t.equal(edits[0]!.priorState, null, "create has null prior_state");
  const updatePrior = edits[1]!.priorState as EntityData;
  t.equal(updatePrior.name, "Gem", "update prior is the create payload");
});
