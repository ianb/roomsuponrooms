import t from "tap";
import "../src/games/test-world.js";
import "../src/games/colossal-cave/index.js";
import "../src/games/the-aaru/index.js";
import "../src/games/tinkermarket/index.js";
import { listGames } from "../src/games/registry.js";

const allGames = listGames();

for (const def of allGames) {
  t.test(`${def.title}: loads without errors`, (t) => {
    const instance = def.create();
    const rooms = instance.store.findByTag("room");
    t.ok(rooms.length > 0, `has ${rooms.length} rooms`);
    t.end();
  });

  t.test(`${def.title}: all exits valid`, (t) => {
    const instance = def.create();
    const exits = instance.store.findByTag("exit");
    for (const exit of exits) {
      if (!exit.exit) {
        t.fail(`${exit.id}: has no exit data`);
        continue;
      }
      const dest = exit.exit.destination;
      const intent = exit.exit.destinationIntent;
      if (!dest && !intent) {
        t.fail(`${exit.id}: has neither destination nor intent`);
      }
      if (dest && !instance.store.has(dest)) {
        t.fail(`${exit.id}: destination ${dest} not found`);
      }
    }
    t.pass("exit check complete");
    t.end();
  });

  t.test(`${def.title}: all entity locations valid`, (t) => {
    const instance = def.create();
    const ids = instance.store.getAllIds();
    for (const id of ids) {
      const entity = instance.store.get(id);
      const loc = entity.location;
      if (loc === "void" || loc === "world") continue;
      if (!instance.store.has(loc)) {
        t.fail(`${id}: location ${loc} not found`);
      }
    }
    t.pass("location check complete");
    t.end();
  });
}
