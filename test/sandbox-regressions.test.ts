import t from "tap";
import { EntityStore } from "../src/core/entity.js";
import { createRegistry } from "../src/core/properties.js";
import { defineProperty } from "../src/core/properties.js";
import { DEFAULT_HANDLERS } from "../src/core/default-handlers.js";
import { handlerDataToHandler } from "../src/core/handler-eval.js";
import { buildPerformCode } from "../src/server/handler-execute.js";
import { coerceEvents, getSandbox, runWithSandbox, type Sandbox } from "../src/core/sandbox-host.js";
import { colossalCave } from "./helpers.js";
import type { HandlerData } from "../src/core/game-data.js";
import type { VerbContext } from "../src/core/verb-types.js";

function handlerRecord(name: string): HandlerData {
  const rec = DEFAULT_HANDLERS.find((h) => h.name === name);
  if (!rec) throw new Error("no default handler " + name);
  return rec;
}

// A store with a locked, openable container and its key in the player's hand.
function lockWorld() {
  const registry = createRegistry();
  for (const name of ["locked", "open", "unlockedBy"]) {
    defineProperty(registry, {
      name,
      schema: name === "unlockedBy" ? { type: "string", format: "entity-ref" } : { type: "boolean" },
    });
  }
  const store = new EntityStore(registry, 1);
  store.create("world:root", { tags: [], name: "World", description: "", location: "" });
  store.create("room:vault", { tags: ["room"], name: "Vault", description: "A vault.", location: "world:root" });
  store.create("player:1", { tags: ["player"], name: "You", description: "", location: "room:vault" });
  store.create("item:chest", {
    tags: ["openable", "container"],
    name: "iron chest",
    description: "An iron chest.",
    location: "room:vault",
    properties: { locked: true, open: false, unlockedBy: "item:key" },
  });
  store.create("item:key", { tags: [], name: "brass key", description: "", location: "player:1" });
  return store;
}

function ctxFor(store: EntityStore, verb: string): VerbContext {
  return {
    store,
    command: { form: "transitive", verb, object: store.get("item:chest") },
    player: store.get("player:1"),
    room: store.get("room:vault"),
  };
}

t.test("#4 composed veto renders the entity ref, not [object Promise]", async (t) => {
  const store = lockWorld();
  const open = handlerDataToHandler(handlerRecord("open"));
  const result = await open.veto!(ctxFor(store, "open"));
  t.equal(result.blocked, true, "open is vetoed on a locked chest");
  if (result.blocked) {
    t.match(result.output, /is locked/, "veto text rendered");
    t.match(result.output, /\{\{item:chest\|iron chest\}\}/, "lib.ref resolved (awaited)");
    t.notMatch(result.output, /\[object Promise\]/, "no un-awaited Promise leaked into the string");
  }
});

t.test("#4 unlock check (!!await lib.findKey) reflects key presence", async (t) => {
  const store = lockWorld();
  const unlock = handlerDataToHandler(handlerRecord("unlock"));
  t.equal((await unlock.check!(ctxFor(store, "unlock"))).applies, true, "applies when key is held");
  store.setLocation("item:key", "room:vault"); // drop the key
  t.equal((await unlock.check!(ctxFor(store, "unlock"))).applies, false, "rejects when key absent");
});

t.test("#5 lib bridge blocks Object.prototype methods", async (t) => {
  const store = lockWorld();
  const evil = handlerDataToHandler({
    name: "evil",
    pattern: { verb: "evil", form: "transitive" },
    perform: "return await lib.valueOf();",
  });
  await t.rejects(evil.perform(ctxFor(store, "evil")), "lib.valueOf() is not callable through the bridge");
});

t.test("#1 runWithSandbox isolates concurrent (interleaved) request contexts", async (t) => {
  const tag = (id: string): Sandbox => ({ runHandler: async () => id });
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // Interleave: A yields longer than B, so without ALS scoping B's set would
  // clobber a shared global and A would read "B".
  const [a, b] = await Promise.all([
    runWithSandbox(tag("A"), async () => {
      await delay(10);
      return getSandbox().runHandler({ code: "", scope: {}, lib: { invoke: () => null } });
    }),
    runWithSandbox(tag("B"), async () => {
      await delay(1);
      return getSandbox().runHandler({ code: "", scope: {}, lib: { invoke: () => null } });
    }),
  ]);
  t.equal(a, "A", "context A kept its own sandbox across the await");
  t.equal(b, "B", "context B kept its own sandbox");
});

t.test("#2 AI-fallback generated handler applies its events (awaited)", async (t) => {
  const code = buildPerformCode({
    decision: "perform",
    message: "The panel powers on.",
    events: [{ type: "set-property", property: "powered", value: true, description: "Powered on" }],
  });
  t.match(code, /events: \[await lib\.setEvent/, "generator awaits setEvent in the events array");
  const store = lockWorld();
  const handler = handlerDataToHandler({
    name: "ai-test",
    pattern: { verb: "poke", form: "transitive" },
    perform: code,
  });
  const result = await handler.perform(ctxFor(store, "poke"));
  const events = coerceEvents(result);
  t.equal(events.length, 1, "event survived (not dropped as an un-awaited Promise)");
  t.match(events[0], { type: "set-property", property: "powered", value: true }, "correct event");
});

t.test("#3 wave-rod bridge create/vanish persists via events", async (t) => {
  const game = colossalCave();
  const store = game.runner.store;
  store.setProperty("player:1", { name: "location", value: "room:on-east-bank-of-fissure" });
  store.setProperty("item:rod", { name: "location", value: "player:1" });

  await game.do("wave rod");
  t.ok(store.has("exit:fissure-bridge:west"), "bridge exit created");
  t.equal(store.get("exit:fissure-bridge:west").location, "room:on-east-bank-of-fissure", "bridge spans the bank");

  await game.do("wave rod");
  t.equal(
    store.get("exit:fissure-bridge:west").location,
    "void",
    "second wave actually vanishes the bridge (event persisted, not a lost clone mutation)",
  );
});
