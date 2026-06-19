import t from "tap";
import "../src/games/colossal-cave/index.js";
import { getGame } from "../src/games/registry.js";
import { createGameRunner } from "../src/core/index.js";
import { createCaveLib } from "../src/games/colossal-cave/cave-lib.js";
import type { VerbContext } from "../src/core/verb-types.js";

function makeLib() {
  const def = getGame("colossal-cave")!;
  const instance = def.create();
  const runner = createGameRunner(instance);
  const player = runner.store.findByTag("player")[0]!;
  const room = runner.store.get(player.location);
  const context: VerbContext = {
    store: runner.store,
    player,
    room,
    command: { verb: "test", form: "intransitive", raw: "test" } as VerbContext["command"],
  };
  return createCaveLib(context);
}

// Cave-lib methods run parent-side (synchronously), so exercise their argument
// robustness by calling them directly — no sandbox indirection needed.
function callLib<T>(fn: (lib: ReturnType<typeof makeLib>) => T): T {
  return fn(makeLib());
}

// --- lib.get() ---

t.test("lib.get with valid ID returns entity", (t) => {
  const result = callLib((lib) => lib.get("player:1").name) as string;
  t.equal(result, "Adventurer");
  t.end();
});

t.test("lib.get with nonexistent ID throws", (t) => {
  t.throws(() => callLib((lib) => lib.get("npc:nonexistent")));
  t.end();
});

t.test("lib.get with non-string throws LibArgError", (t) => {
  t.throws(
    () => callLib((lib) => lib.get(123)),
    { name: "LibArgError" },
  );
  t.end();
});

t.test("lib.get with undefined throws LibArgError", (t) => {
  t.throws(
    () => callLib((lib) => lib.get(undefined)),
    { name: "LibArgError" },
  );
  t.end();
});

// --- lib.tryGet() ---

t.test("lib.tryGet with valid ID returns entity", (t) => {
  const result = callLib((lib) => lib.tryGet("player:1").name) as string;
  t.equal(result, "Adventurer");
  t.end();
});

t.test("lib.tryGet with nonexistent ID returns null", (t) => {
  const result = callLib((lib) => lib.tryGet("npc:nonexistent"));
  t.equal(result, null);
  t.end();
});

t.test("lib.tryGet with non-string returns null", (t) => {
  const result = callLib((lib) => lib.tryGet(123));
  t.equal(result, null);
  t.end();
});

// --- lib.has() ---

t.test("lib.has with valid ID returns true", (t) => {
  const result = callLib((lib) => lib.has("player:1"));
  t.equal(result, true);
  t.end();
});

t.test("lib.has with non-string returns false", (t) => {
  const result = callLib((lib) => lib.has(null));
  t.equal(result, false);
  t.end();
});

// --- lib.findByTag() ---

t.test("lib.findByTag with valid tag returns array", (t) => {
  const result = callLib((lib) => lib.findByTag("player").length) as number;
  t.ok(result >= 1);
  t.end();
});

t.test("lib.findByTag with non-string returns empty array", (t) => {
  const result = callLib((lib) => lib.findByTag(42).length) as number;
  t.equal(result, 0);
  t.end();
});

// --- lib.getContentsDeep() ---

t.test("lib.getContentsDeep with non-string returns empty array", (t) => {
  const result = callLib((lib) => lib.getContentsDeep(undefined).length) as number;
  t.equal(result, 0);
  t.end();
});

t.test("lib.getContentsDeep with nonexistent ID returns empty array", (t) => {
  const result = callLib((lib) => lib.getContentsDeep("fake:id").length) as number;
  t.equal(result, 0);
  t.end();
});

// --- lib.getExitDestinations() ---

t.test("lib.getExitDestinations with non-string returns empty array", (t) => {
  const result = callLib((lib) => lib.getExitDestinations(null).length) as number;
  t.equal(result, 0);
  t.end();
});

t.test("lib.getExitDestinations with nonexistent room returns empty array", (t) => {
  const result = callLib((lib) => lib.getExitDestinations("room:fake").length) as number;
  t.equal(result, 0);
  t.end();
});

// --- lib.randomInt() ---

t.test("lib.randomInt with 0 returns 0", (t) => {
  const result = callLib((lib) => lib.randomInt(0)) as number;
  t.equal(result, 0);
  t.end();
});

t.test("lib.randomInt with negative returns 0", (t) => {
  const result = callLib((lib) => lib.randomInt(-5)) as number;
  t.equal(result, 0);
  t.end();
});

t.test("lib.randomInt with positive returns valid range", (t) => {
  const result = callLib((lib) => lib.randomInt(10)) as number;
  t.ok(result >= 0 && result < 10);
  t.end();
});

// --- lib.pick() ---

t.test("lib.pick with empty array returns undefined", (t) => {
  const result = callLib((lib) => lib.pick([]));
  t.equal(result, undefined);
  t.end();
});

t.test("lib.pick with single element returns it", (t) => {
  const result = callLib((lib) => lib.pick(["only"])) as string;
  t.equal(result, "only");
  t.end();
});

// --- lib.chance() ---

t.test("lib.chance(0) always returns false", (t) => {
  const result = callLib((lib) => lib.chance(0));
  t.equal(result, false);
  t.end();
});

t.test("lib.chance(1) always returns true", (t) => {
  const result = callLib((lib) => lib.chance(1));
  t.equal(result, true);
  t.end();
});

t.test("lib.chance(-1) returns false", (t) => {
  const result = callLib((lib) => lib.chance(-1));
  t.equal(result, false);
  t.end();
});

// --- lib.odds() ---

t.test("lib.odds(0, 10) always returns false", (t) => {
  const result = callLib((lib) => lib.odds(0, 10));
  t.equal(result, false);
  t.end();
});

t.test("lib.odds(10, 10) always returns true", (t) => {
  const result = callLib((lib) => lib.odds(10, 10));
  t.equal(result, true);
  t.end();
});

t.test("lib.odds(1, 0) returns false (no divide by zero)", (t) => {
  const result = callLib((lib) => lib.odds(1, 0));
  t.equal(result, false);
  t.end();
});

// --- lib.setProp() ---

t.test("lib.setProp with non-string entityId throws", (t) => {
  t.throws(
    () => callLib((lib) => lib.setProp(123, {property: "x", value: 1, description: ""})),
    { name: "LibArgError" },
  );
  t.end();
});

t.test("lib.setProp with no opts throws", (t) => {
  t.throws(
    () => callLib((lib) => lib.setProp("player:1")),
    { name: "LibArgError" },
  );
  t.end();
});

// --- lib.moveTo() ---

t.test("lib.moveTo with non-string entityId throws", (t) => {
  t.throws(
    () => callLib((lib) => lib.moveTo(null, {to: "room:x", description: ""})),
    { name: "LibArgError" },
  );
  t.end();
});

t.test("lib.moveTo with missing to throws", (t) => {
  t.throws(
    () => callLib((lib) => lib.moveTo("player:1", {description: ""})),
    { name: "LibArgError" },
  );
  t.end();
});

// --- lib.teleport() ---

t.test("lib.teleport with non-string args throws", (t) => {
  t.throws(
    () => callLib((lib) => lib.teleport(null, "room:x")),
    { name: "LibArgError" },
  );
  t.end();
});

// --- lib.setProperty() ---

t.test("lib.setProperty with non-string id throws", (t) => {
  t.throws(
    () => callLib((lib) => lib.setProperty(42, {name: "x", value: 1})),
    { name: "LibArgError" },
  );
  t.end();
});

// --- lib.addScore() ---

t.test("lib.addScore with non-number is safe", (t) => {
  t.doesNotThrow(() => callLib((lib) => lib.addScore("not a number" as unknown as number)));
  t.end();
});
