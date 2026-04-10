import t from "tap";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLanguageModelV3 } from "ai/test";
import "../src/games/test-world.js";
import { FileStorage } from "../src/server/storage-file.js";
import { setStorage, getStorage } from "../src/server/storage-instance.js";
import { tickSession } from "../src/server/agent-loop.js";
import { emptyAgentTokenUsage } from "../src/server/storage.js";
import type { AiEntityRecord } from "../src/server/storage.js";

interface ToolStep {
  toolName: string;
  input: Record<string, unknown>;
}

/**
 * Build a mock language model that returns the given sequence of tool-call
 * batches. Each call to doGenerate emits one batch (one assistant turn with
 * its tool calls). After the script is exhausted, falls back to a single
 * finish() call so the loop terminates.
 */
function makeSequentialMock(script: ToolStep[][]): MockLanguageModelV3 {
  const remaining = [...script];
  return new MockLanguageModelV3({
    doGenerate: async () => {
      const step = remaining.shift() || [
        { toolName: "finish", input: { summary: "script exhausted" } },
      ];
      return {
        finishReason: { type: "tool-calls", raw: "tool_use" },
        usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
        content: step.map((s, i) => ({
          type: "tool-call" as const,
          toolCallId: `call-${remaining.length}-${i}`,
          toolName: s.toolName,
          input: JSON.stringify(s.input),
        })),
        warnings: [],
      };
    },
  });
}

function makeStorage(): { dataDir: string; userDataDir: string; cleanup: () => void } {
  const dataDir = mkdtempSync(join(tmpdir(), "rur-loop-test-"));
  const userDataDir = mkdtempSync(join(tmpdir(), "rur-loop-test-user-"));
  setStorage(new FileStorage({ dataDir, userDataDir }));
  return {
    dataDir,
    userDataDir,
    cleanup: () => {
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

async function makeSession(id: string, request: string, turnLimit = 10): Promise<void> {
  const now = "2026-04-09T00:00:00Z";
  await getStorage().createAgentSession({
    id,
    gameId: "test",
    userId: "u-1",
    request,
    status: "running",
    messages: [],
    savedVars: {},
    turnCount: 0,
    turnLimit,
    summary: null,
    revertOf: null,
    model: null,
    tokenUsage: emptyAgentTokenUsage(),
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  });
}

t.test("loop creates an entity then finishes; entity is committed", async (t) => {
  const { cleanup } = makeStorage();
  t.teardown(cleanup);
  await makeSession("s-loop1", "Add a lantern to the clearing");

  const model = makeSequentialMock([
    [
      {
        toolName: "apply_edits",
        input: {
          edits: [
            {
              entity: {
                id: "item:loop-lantern",
                create: {
                  tags: ["portable"],
                  name: "Loop Lantern",
                  description: "A lantern from the loop test.",
                  location: "room:clearing",
                },
              },
            },
          ],
        },
      },
    ],
    [{ toolName: "finish", input: { summary: "Added the lantern" } }],
  ]);

  const result = await tickSession("s-loop1", { model });
  t.equal(result.status, "finished");
  t.equal(result.summary, "Added the lantern");

  // The entity should be in the materialized table.
  const all = await getStorage().loadAiEntities("test");
  const lantern = all.find((r: AiEntityRecord) => r.id === "item:loop-lantern");
  t.ok(lantern, "lantern committed to materialized table");
  t.equal(lantern!.name, "Loop Lantern");
  t.equal(lantern!.authoring.creationSource, "agent");
});

t.test("loop bail() leaves session bailed and edits unapplied", async (t) => {
  const { cleanup } = makeStorage();
  t.teardown(cleanup);
  await makeSession("s-loop2", "Try then give up");

  const model = makeSequentialMock([
    [
      {
        toolName: "apply_edits",
        input: {
          edits: [
            {
              entity: {
                id: "item:loop-skip",
                create: {
                  tags: ["portable"],
                  name: "Skip",
                  description: "Will not commit.",
                  location: "room:clearing",
                },
              },
            },
          ],
        },
      },
    ],
    [{ toolName: "bail", input: { reason: "Changed my mind" } }],
  ]);

  const result = await tickSession("s-loop2", { model });
  t.equal(result.status, "bailed");

  const all = await getStorage().loadAiEntities("test");
  t.notOk(
    all.find((r: AiEntityRecord) => r.id === "item:loop-skip"),
    "bailed entity is not in materialized table",
  );

  const session = await getStorage().getAgentSession("s-loop2");
  t.equal(session!.status, "bailed");
});

t.test("loop turn limit aborts as failed without commit", async (t) => {
  const { cleanup } = makeStorage();
  t.teardown(cleanup);
  await makeSession("s-loop3", "Loop forever", 2);

  // Mock that keeps querying without ever finishing.
  const model = new MockLanguageModelV3({
    doGenerate: async () => ({
      finishReason: { type: "tool-calls", raw: "tool_use" },
      usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      content: [
        {
          type: "tool-call" as const,
          toolCallId: `call-${Math.random()}`,
          toolName: "query",
          input: JSON.stringify({ kind: "findByTag", tag: "room" }),
        },
      ],
      warnings: [],
    }),
  });

  const result = await tickSession("s-loop3", { model, maxStepsPerTick: 5 });
  t.equal(result.status, "failed");
  t.match(result.summary || "", /[Tt]urn limit/);
});

t.test("loop validation failure feeds error back; agent retries successfully", async (t) => {
  const { cleanup } = makeStorage();
  t.teardown(cleanup);
  await makeSession("s-loop4", "Create with retry");

  const model = makeSequentialMock([
    [
      {
        toolName: "apply_edits",
        input: {
          edits: [
            {
              entity: {
                id: "item:bad-loc",
                create: {
                  tags: ["portable"],
                  name: "Bad",
                  description: "Wrong location.",
                  location: "room:does-not-exist",
                },
              },
            },
          ],
        },
      },
    ],
    [
      {
        toolName: "apply_edits",
        input: {
          edits: [
            {
              entity: {
                id: "item:good-loc",
                create: {
                  tags: ["portable"],
                  name: "Good",
                  description: "Right location.",
                  location: "room:clearing",
                },
              },
            },
          ],
        },
      },
    ],
    [{ toolName: "finish", input: { summary: "Recovered after a bad batch" } }],
  ]);

  const result = await tickSession("s-loop4", { model });
  t.equal(result.status, "finished");

  const all = await getStorage().loadAiEntities("test");
  t.notOk(
    all.find((r: AiEntityRecord) => r.id === "item:bad-loc"),
    "bad batch was rejected",
  );
  t.ok(
    all.find((r: AiEntityRecord) => r.id === "item:good-loc"),
    "good batch was committed",
  );
});
