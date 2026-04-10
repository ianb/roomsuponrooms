import t from "tap";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../src/games/test-world.js";
import { FileStorage } from "../src/server/storage-file.js";
import { setStorage, getStorage } from "../src/server/storage-instance.js";
import { handleAiAgentCommand } from "../src/server/ai-commands.js";
import { emptyAgentTokenUsage } from "../src/server/storage.js";
import type { AiEntityRecord } from "../src/server/storage.js";

// We can't inject a fake model directly through handleAiAgentCommand because
// it goes through tickSession which uses the cached LLM. So this test only
// covers the storage and dispatch wiring — the loop+model behavior is fully
// covered by test/agent-loop.test.ts which injects a MockLanguageModelV3.
//
// Here we verify that:
//  - agent_sessions get created with the right shape via the command path
//  - the listSessions API returns them
//
// We do this by creating a session manually and inspecting the storage.

t.test("agent session storage wiring is reachable from FileStorage", async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), "rur-cmd-test-"));
  const userDataDir = mkdtempSync(join(tmpdir(), "rur-cmd-test-user-"));
  setStorage(new FileStorage({ dataDir, userDataDir }));
  t.teardown(() => {
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(userDataDir, { recursive: true, force: true });
  });

  await getStorage().createAgentSession({
    id: "s-cmd1",
    gameId: "test",
    userId: "u-1",
    request: "Add a thing",
    status: "running",
    messages: [],
    savedVars: {},
    turnCount: 0,
    turnLimit: 10,
    summary: null,
    revertOf: null,
    model: null,
    tokenUsage: emptyAgentTokenUsage(),
    createdAt: "2026-04-09T00:00:00Z",
    updatedAt: "2026-04-09T00:00:00Z",
    finishedAt: null,
  });

  const list = await getStorage().listAgentSessions({ gameId: "test" });
  t.equal(list.length, 1);
  t.equal(list[0]!.id, "s-cmd1");
});

t.test("handleAiAgentCommand is exported and callable", (t) => {
  // Just an existence/shape check — the real loop behavior is in agent-loop.test.ts
  t.equal(typeof handleAiAgentCommand, "function");
  t.end();
});

t.test("commit fan-out writes agent provenance", async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), "rur-prov-test-"));
  const userDataDir = mkdtempSync(join(tmpdir(), "rur-prov-test-user-"));
  setStorage(new FileStorage({ dataDir, userDataDir }));
  t.teardown(() => {
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(userDataDir, { recursive: true, force: true });
  });

  const storage = getStorage();
  await storage.createAgentSession({
    id: "s-prov1",
    gameId: "test",
    userId: "u-author",
    request: "make a thing",
    status: "running",
    messages: [],
    savedVars: {},
    turnCount: 0,
    turnLimit: 10,
    summary: null,
    revertOf: null,
    model: null,
    tokenUsage: emptyAgentTokenUsage(),
    createdAt: "2026-04-09T00:00:00Z",
    updatedAt: "2026-04-09T00:00:00Z",
    finishedAt: null,
  });
  await storage.appendWorldEdit({
    gameId: "test",
    sessionId: "s-prov1",
    targetKind: "entity",
    targetId: "item:provenance-test",
    op: "create",
    payload: {
      tags: ["portable"],
      name: "Provenance Test",
      description: "Made by an agent.",
      location: "room:clearing",
    },
    createdAt: "2026-04-09T00:00:01Z",
  });
  await storage.commitSession("s-prov1", "All done");

  const all = await storage.loadAiEntities("test");
  const made = all.find((r: AiEntityRecord) => r.id === "item:provenance-test");
  t.ok(made);
  t.equal(made!.authoring.createdBy, "u-author");
  t.equal(made!.authoring.creationSource, "agent");
  t.equal(made!.authoring.creationCommand, "s-prov1");
});
