import t from "tap";
import { EntityStore } from "../src/core/entity.js";
import { createRegistry } from "../src/core/properties.js";
import { HandlerLib } from "../src/core/handler-lib.js";
import { NodeQuickJsSandbox } from "../src/server/sandbox-quickjs.js";
import { coerceEvents, type LibDispatch } from "../src/core/sandbox-host.js";
import type { VerbContext } from "../src/core/verb-types.js";

// Build a tiny real store: a lamp in a room, a coin inside the lamp.
function makeWorld(): { store: EntityStore; lib: HandlerLib; lamp: string } {
  const store = new EntityStore(createRegistry(), 1);
  store.create("world:root", { tags: [], name: "World", description: "", location: "" });
  store.create("room:cave", { tags: ["room"], name: "Cave", description: "A dim cave.", location: "world:root" });
  store.create("player:1", { tags: ["player"], name: "You", description: "", location: "room:cave" });
  store.create("item:lamp", { tags: [], name: "brass lamp", description: "An old brass lamp.", location: "room:cave" });
  store.create("item:coin", { tags: [], name: "gold coin", description: "", location: "item:lamp" });
  const context: VerbContext = {
    store,
    command: { form: "intransitive", verb: "examine" },
    player: store.get("player:1"),
    room: store.get("room:cave"),
  };
  return { store, lib: new HandlerLib(context), lamp: "item:lamp" };
}

// Dispatch every lib.* call to the real HandlerLib instance (parent-side),
// exactly as handler-eval will. Args (snapshots / ids) pass straight through;
// the lib methods read .id/.name/.properties/.tags off whatever they get.
function realDispatch(store: EntityStore, lib: HandlerLib): LibDispatch {
  const methods: Record<string, (...args: unknown[]) => unknown> = {
    examine: (target) => lib.examine(target as never),
    contents: (id) => store.getContents(id as string).map((e) => ({ id: e.id, name: e.name })),
    ref: (target) => lib.ref(target as never),
    setEvent: (id, opts) => lib.setEvent(id as string, opts as never),
  };
  return { invoke: (method, args) => methods[method](...args) };
}

t.test("real HandlerLib bridged through the sandbox via generic invoke", async (t) => {
  const { store, lib, lamp } = makeWorld();
  const sandbox = new NodeQuickJsSandbox();
  const result = await sandbox.runHandler({
    code: `
      const looked = await lib.examine(object);
      const items = await lib.contents(object.id);
      const names = items.map((e) => e.name).join(", ");
      return {
        output: looked.output + " Inside: " + names,
        events: [await lib.setEvent(object.id, { property: "examined", value: true, description: "studied it" })],
      };
    `,
    scope: { object: store.getSnapshot(lamp) },
    lib: realDispatch(store, lib),
  });

  t.match(result, { output: "An old brass lamp. Inside: gold coin" }, "real examine() + contents() composed");
  const events = coerceEvents(result);
  t.equal(events.length, 1, "builder produced one event");
  t.match(events[0], { type: "set-property", entityId: "item:lamp", property: "examined", value: true }, "setEvent shape matches HandlerLib");
});

t.test("ref() returns real entityRef markup", async (t) => {
  const { store, lib, lamp } = makeWorld();
  const sandbox = new NodeQuickJsSandbox();
  const result = await sandbox.runHandler({
    code: `return { output: await lib.ref(object), events: [] };`,
    scope: { object: store.getSnapshot(lamp) },
    lib: realDispatch(store, lib),
  });
  t.match(result, { output: "{{item:lamp|brass lamp}}" }, "ref crosses as real markup");
});
