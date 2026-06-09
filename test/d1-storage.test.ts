import t from "tap";
import { createTestD1 } from "./d1-stub.js";
import { D1Storage } from "../src/server/storage-d1.js";
import type {
  AgentSessionRecord,
  AiEntityRecord,
  BugReport,
  NewWorldEditRecord,
  UserRecord,
  AiCallRecord,
} from "../src/server/storage.js";
import { emptyAgentTokenUsage } from "../src/server/storage.js";
import type { EntityData } from "../src/core/game-data.js";

function makeStorage(): D1Storage {
  return new D1Storage(createTestD1());
}

const AUTHORING = { createdBy: "u-1", creationSource: "manual" };

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

function aiEntity(overrides: Partial<AiEntityRecord>): AiEntityRecord {
  return {
    ...entity({}),
    createdAt: "2026-01-01T00:00:00Z",
    gameId: "test-game",
    authoring: AUTHORING,
    ...overrides,
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

void t.test("ai entities: save, load, ids, remove", async (t) => {
  const storage = makeStorage();

  await storage.saveAiEntity(aiEntity({ id: "item:lamp", name: "Lamp" }));
  await storage.saveAiEntity(aiEntity({ id: "item:rope", name: "Rope" }));

  const loaded = await storage.loadAiEntities("test-game");
  t.equal(loaded.length, 2);
  const lamp = loaded.find((r) => r.id === "item:lamp");
  t.equal(lamp!.name, "Lamp");
  t.equal(lamp!.authoring.createdBy, "u-1");

  t.same(await storage.getAiEntityIds("test-game"), new Set(["item:lamp", "item:rope"]));

  t.equal(await storage.removeAiEntity("test-game", "item:lamp"), true, "removal reports true");
  t.equal(
    await storage.removeAiEntity("test-game", "item:lamp"),
    false,
    "second removal reports false",
  );
  t.equal((await storage.loadAiEntities("test-game")).length, 1);
});

void t.test("ai handlers: save, list, remove", async (t) => {
  const storage = makeStorage();

  await storage.saveHandler({
    name: "ai-frob-thing",
    pattern: { verb: "frob", form: "transitive" },
    perform: "lib.say('frobbed')",
    createdAt: "2026-01-01T00:00:00Z",
    gameId: "test-game",
    authoring: AUTHORING,
  });

  const handlers = await storage.listHandlers("test-game");
  t.equal(handlers.length, 1);
  t.equal(handlers[0]!.name, "ai-frob-thing");
  t.equal(handlers[0]!.pattern.verb, "frob");

  t.equal(await storage.removeHandler("test-game", "ai-frob-thing"), true);
  t.equal(await storage.removeHandler("test-game", "ai-frob-thing"), false);
});

void t.test("event log: append assigns seq, pop, clear, per-user isolation", async (t) => {
  const storage = makeStorage();
  const session = { gameId: "test-game", userId: "u-1" };
  const otherSession = { gameId: "test-game", userId: "u-2" };

  await storage.appendEvent(session, {
    command: "take lamp",
    events: [{ type: "set-property", entityId: "item:lamp", description: "moved" }],
    output: "Taken.",
    timestamp: "2026-01-01T00:00:00Z",
  });
  await storage.appendEvent(session, {
    command: "drop lamp",
    events: [],
    timestamp: "2026-01-01T00:00:01Z",
  });
  await storage.appendEvent(otherSession, {
    command: "look",
    events: [],
    timestamp: "2026-01-01T00:00:02Z",
  });

  const events = await storage.loadEvents(session);
  t.equal(events.length, 2, "other user's events not included");
  t.equal(events[0]!.command, "take lamp");
  t.equal(events[0]!.output, "Taken.");

  const popped = await storage.popEvent(session);
  t.equal(popped!.command, "drop lamp", "pop returns the most recent event");
  t.equal((await storage.loadEvents(session)).length, 1);

  await storage.clearEvents(session);
  t.same(await storage.loadEvents(session), []);
  t.equal((await storage.loadEvents(otherSession)).length, 1, "clear only touches the session");
});

void t.test("conversation entries round-trip", async (t) => {
  const storage = makeStorage();

  await storage.saveWordEntry({
    word: "treasure",
    narration: "You ask about the treasure.",
    response: '"Buried under the oak," she whispers.',
    createdAt: "2026-01-01T00:00:00Z",
    gameId: "test-game",
    npcId: "npc:hermit",
    authoring: AUTHORING,
  });

  const entries = await storage.loadConversationEntries("test-game", "npc:hermit");
  t.equal(entries.length, 1);
  t.equal(entries[0]!.word, "treasure");
  t.match(entries[0]!.response, /oak/);
});

void t.test("users: create, find, updateLastLogin", async (t) => {
  const storage = makeStorage();
  t.equal(await storage.hasAnyUsers(), false);

  const user: UserRecord = {
    id: "u-1",
    displayName: "Ian",
    email: "ian@example.com",
    googleId: "g-123",
    roles: ["admin"],
    createdAt: "2026-01-01T00:00:00Z",
    lastLoginAt: "2026-01-01T00:00:00Z",
  };
  await storage.createUser(user);

  t.equal(await storage.hasAnyUsers(), true);
  t.same(await storage.findUserById("u-1"), user);
  t.equal((await storage.findUserByGoogleId("g-123"))!.id, "u-1");
  t.equal((await storage.findUserByName("Ian"))!.id, "u-1");
  t.equal(await storage.findUserById("u-missing"), null);

  await storage.updateLastLogin("u-1");
  const updated = await storage.findUserById("u-1");
  t.not(updated!.lastLoginAt, "2026-01-01T00:00:00Z", "last login moved forward");
});

void t.test("bug reports: save, list with filters, update", async (t) => {
  const storage = makeStorage();

  const report: BugReport = {
    id: "b-1",
    gameId: "test-game",
    userId: "u-1",
    userName: "Ian",
    description: "The lamp disappears",
    roomId: "room:start",
    roomName: "Start",
    recentCommands: [{ command: "take lamp", events: [], timestamp: "2026-01-01T00:00:00Z" }],
    entityChanges: [],
    status: "new",
    fixCommit: null,
    duplicateOf: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: null,
  };
  await storage.saveBugReport(report);
  await storage.saveBugReport({ ...report, id: "b-2", status: "seen", gameId: "other-game" });

  t.equal((await storage.listBugReports()).length, 2);
  t.equal((await storage.listBugReports({ status: "new" })).length, 1);
  t.equal((await storage.listBugReports({ gameId: "other-game" }))[0]!.id, "b-2");

  const fetched = await storage.getBugReport("b-1");
  t.equal(fetched!.description, "The lamp disappears");
  t.equal(fetched!.recentCommands[0]!.command, "take lamp");

  await storage.updateBugReport("b-1", { status: "fixed", fixCommit: "abc123" });
  const fixed = await storage.getBugReport("b-1");
  t.equal(fixed!.status, "fixed");
  t.equal(fixed!.fixCommit, "abc123");
});

void t.test("agent session round-trip: create, get, update, list", async (t) => {
  const storage = makeStorage();

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

void t.test("commitSession fans out create edits and marks applied", async (t) => {
  const storage = makeStorage();

  await storage.createAgentSession(newSession({}));
  await storage.appendWorldEdit(
    newEdit({
      targetId: "item:lantern",
      op: "create",
      payload: entity({ id: "item:lantern", name: "Lantern" }),
    }),
  );

  await storage.commitSession("s-test1", "Added a lantern");

  const edits = await storage.getSessionEdits("s-test1");
  t.equal(edits[0]!.applied, true);

  const all = await storage.loadAiEntities("test-game");
  const lantern = all.find((r) => r.id === "item:lantern");
  t.ok(lantern, "lantern entity exists in materialized table");
  t.equal(lantern!.name, "Lantern");
  t.equal(lantern!.authoring.creationSource, "agent");

  const session = await storage.getAgentSession("s-test1");
  t.equal(session!.status, "finished");
  t.equal(session!.summary, "Added a lantern");
});

void t.test("commitSession captures prior_state for update over existing entity", async (t) => {
  const storage = makeStorage();

  await storage.saveAiEntity(
    aiEntity({ id: "item:lantern", name: "Old Lantern", description: "Dim." }),
  );
  await storage.createAgentSession(newSession({}));
  await storage.appendWorldEdit(
    newEdit({ targetId: "item:lantern", op: "update", payload: { name: "Bright Lantern" } }),
  );

  await storage.commitSession("s-test1", "Brightened the lantern");

  const edits = await storage.getSessionEdits("s-test1");
  t.equal(edits[0]!.applied, true);
  const prior = edits[0]!.priorState as EntityData;
  t.equal(prior.name, "Old Lantern", "prior_state captures the pre-update name");

  const all = await storage.loadAiEntities("test-game");
  const lantern = all.find((r) => r.id === "item:lantern");
  t.equal(lantern!.name, "Bright Lantern");
  t.equal(lantern!.description, "Dim.", "untouched fields preserved");
});

void t.test("ai call log: log, get, list with limit", async (t) => {
  const storage = makeStorage();

  const call: AiCallRecord = {
    id: "aic-1",
    timestamp: "2026-01-01T00:00:00Z",
    gameId: "test-game",
    userId: "u-1",
    kind: "verb-fallback",
    context: "frob lamp",
    model: "test-model",
    systemPrompt: "be helpful",
    prompt: "the player frobbed",
    response: { ok: true },
    durationMs: 1200,
  };
  await storage.logAiCall(call);
  await storage.logAiCall({ ...call, id: "aic-2", timestamp: "2026-01-01T00:01:00Z" });

  const fetched = await storage.getAiCall("aic-1");
  t.ok(fetched);
  t.equal(fetched!.kind, "verb-fallback");
  t.same(fetched!.response, { ok: true });

  const listed = await storage.listAiCalls({ gameId: "test-game", limit: 1 });
  t.equal(listed.length, 1);
  t.equal(listed[0]!.id, "aic-2", "newest first");
});
