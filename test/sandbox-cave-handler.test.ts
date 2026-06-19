import t from "tap";
import { EntityStore } from "../src/core/entity.js";
import { createRegistry } from "../src/core/properties.js";
import { createCaveLib } from "../src/games/colossal-cave/cave-lib.js";
import { NodeQuickJsSandbox } from "../src/server/sandbox-quickjs.js";
import { coerceEvents, type LibDispatch } from "../src/core/sandbox-host.js";
import type { VerbContext } from "../src/core/verb-types.js";

// Real ColossalCaveLib over a real store, in the room where xyzzy works.
function caveWorld() {
  const store = new EntityStore(createRegistry(), 1);
  store.create("world:root", { tags: [], name: "World", description: "", location: "" });
  store.create("room:inside-building", { tags: ["room"], name: "Inside Building", description: "A building.", location: "world:root" });
  store.create("room:in-debris-room", { tags: ["room"], name: "Debris Room", description: "Debris.", location: "world:root" });
  store.create("player:1", { tags: ["player"], name: "You", description: "", location: "room:inside-building" });
  const context: VerbContext = {
    store,
    command: { form: "intransitive", verb: "xyzzy" },
    player: store.get("player:1"),
    room: store.get("room:inside-building"),
  };
  const lib = createCaveLib(context);
  const dispatch: LibDispatch = {
    invoke: (method, args) => {
      const fn = (lib as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
      return fn.apply(lib, args);
    },
  };
  return { store, dispatch };
}

// The real xyzzy handler, migrated: `lib.*` calls awaited.
const XYZZY = `
  var loc = room.id;
  if (loc === 'room:inside-building') return { output: '', events: await lib.teleport(loc, 'room:in-debris-room') };
  if (loc === 'room:in-debris-room') return { output: '', events: await lib.teleport(loc, 'room:inside-building') };
  return await lib.result('Nothing happens.');
`;

t.test("real ColossalCaveLib.teleport via sandbox produces the move event", async (t) => {
  const { store, dispatch } = caveWorld();
  const sandbox = new NodeQuickJsSandbox();
  const result = await sandbox.runHandler({
    code: XYZZY,
    scope: { room: store.getSnapshot("room:inside-building") },
    lib: dispatch,
  });
  const events = coerceEvents(result);
  t.equal(events.length, 1, "one teleport event");
  t.match(events[0], { type: "set-property", property: "location", value: "room:in-debris-room", entityId: "player:1" }, "real teleport() crossed the boundary");
});

t.test("real ColossalCaveLib.result via sandbox (fallback branch)", async (t) => {
  const { store, dispatch } = caveWorld();
  const result = await new NodeQuickJsSandbox().runHandler({
    code: `return await lib.result('Nothing happens.');`,
    scope: { room: store.getSnapshot("room:inside-building") },
    lib: dispatch,
  });
  t.match(result, { output: "Nothing happens.", events: [] }, "lib.result shape matches");
});
