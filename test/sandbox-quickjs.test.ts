import t from "tap";
import { NodeQuickJsSandbox } from "../src/server/sandbox-quickjs.js";
import { coerceEvents, type LibDispatch } from "../src/core/sandbox-host.js";

// Wrap a plain methods object as the generic LibDispatch the sandbox bridges.
function dispatch(methods: Record<string, (...args: unknown[]) => unknown>): LibDispatch {
  return {
    invoke: (method, args) => {
      const fn = methods[method];
      if (typeof fn !== "function") throw new Error("no lib method " + method);
      return fn(...args);
    },
  };
}

t.test("runs a handler: scope + awaited lib calls -> {output, events}", async (t) => {
  const sandbox = new NodeQuickJsSandbox();
  const calls: unknown[] = [];
  const lib = dispatch({
    examine: (id) => (id === "lamp" ? { output: "An old brass lamp." } : { output: "nothing" }),
    award: (track, delta) => {
      calls.push([track, delta]);
      return { type: "set-property", entityId: "player", property: track, value: 5 + (delta as number) };
    },
  });
  const result = await sandbox.runHandler({
    code: `
      const looked = await lib.examine(object.id);
      const ev = await lib.award("craft", 2);
      return { output: "You study the " + object.name + ". " + looked.output, events: [ev] };
    `,
    scope: { object: { id: "lamp", name: "brass lamp" } },
    lib,
  });

  t.match(result, { output: "You study the brass lamp. An old brass lamp." }, "scope + lib composed");
  const events = coerceEvents(result);
  t.equal(events.length, 1, "one event returned");
  t.match(events[0], { type: "set-property", entityId: "player", property: "craft", value: 7 }, "lib.award ran in the host");
  t.same(calls, [["craft", 2]], "host saw the call once with marshalled args");
});

t.test("array return crosses as JSON", async (t) => {
  const sandbox = new NodeQuickJsSandbox();
  const lib = dispatch({ contents: (id) => (id === "lamp" ? [{ id: "coin", name: "gold coin" }] : []) });
  const result = await sandbox.runHandler({
    code: `const items = await lib.contents("lamp"); return { output: items.map((e) => e.name).join(", "), events: [] };`,
    scope: {},
    lib,
  });
  t.match(result, { output: "gold coin" }, "array of snapshots crossed the boundary");
});

t.test("SVal-style escape reaches nothing (no host process, codegen contained)", async (t) => {
  const sandbox = new NodeQuickJsSandbox();
  const result = await sandbox.runHandler({
    code: `
      let viaCtor;
      try { viaCtor = typeof (({}).constructor.constructor("return typeof process")()); }
      catch (e) { viaCtor = "threw"; }
      return { output: [typeof process, typeof fetch, viaCtor].join(","), events: [] };
    `,
    scope: {},
    lib: dispatch({}),
  });
  t.match(result, { output: /^undefined,undefined,(string|threw)$/ }, "no host globals reachable");
});
