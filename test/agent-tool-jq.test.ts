import t from "tap";
import { runJq } from "../src/server/agent-tool-jq.js";
import type { ToolContext } from "../src/server/agent-tool-context.js";

function fakeContext(savedVars: Record<string, unknown> = {}): ToolContext {
  return {
    storage: undefined as unknown as ToolContext["storage"],
    gameId: "test",
    sessionId: "s-test",
    store: undefined as unknown as ToolContext["store"],
    verbs: undefined as unknown as ToolContext["verbs"],
    pendingEdits: [],
    savedVars,
    terminate: null,
    editsSinceLastPlaytest: false,
  };
}

t.test("jq filters inline JSON", async (t) => {
  const result = await runJq(fakeContext(), {
    source: { json: [{ a: 1 }, { a: 2 }, { a: 3 }] },
    filter: "[.[] | select(.a > 1)]",
  });
  t.equal(result.ok, true);
  if (result.ok) {
    t.same(result.result, [{ a: 2 }, { a: 3 }]);
  }
});

t.test("jq reads from saved var", async (t) => {
  const ctx = fakeContext({ rooms: [{ id: "room:a" }, { id: "room:b" }] });
  const result = await runJq(ctx, {
    source: { var: "rooms" },
    filter: "map(.id)",
  });
  t.equal(result.ok, true);
  if (result.ok) {
    t.same(result.result, ["room:a", "room:b"]);
  }
});

t.test("jq returns error for unknown var", async (t) => {
  const result = await runJq(fakeContext(), {
    source: { var: "missing" },
    filter: ".",
  });
  t.equal(result.ok, false);
  if (!result.ok) {
    t.match(result.error, /No saved variable/);
  }
});

t.test("jq returns error for invalid filter", async (t) => {
  const result = await runJq(fakeContext(), {
    source: { json: [1, 2, 3] },
    filter: "this is not jq",
  });
  t.equal(result.ok, false);
});
