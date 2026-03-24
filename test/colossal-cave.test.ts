import { test } from "tap"; // eslint-disable-line import/order
import { getGame } from "../src/games/registry.js";
import "../src/games/colossal-cave/index.js";
import { createGameRunner } from "../src/core/index.js";

function newGame() {
  const def = getGame("colossal-cave");
  if (!def) {
    test.bail("colossal-cave game not registered");
    throw def; // unreachable but satisfies type narrowing
  }
  return createGameRunner(def.create());
}

test("game loads and starts at end of road", (t) => {
  const game = newGame();
  t.equal(game.currentRoom(), "room:at-end-of-road");
  const output = game.look();
  t.match(output, /end of a road/i);
  t.end();
});

test("can move to inside building", (t) => {
  const game = newGame();
  game.command("west");
  t.equal(game.currentRoom(), "room:inside-building");
  t.end();
});

test("can move to hill", (t) => {
  const game = newGame();
  game.command("east");
  t.equal(game.currentRoom(), "room:at-hill-in-road");
  t.end();
});

test("can move through valley to streambed", (t) => {
  const game = newGame();
  game.command("south");
  t.equal(game.currentRoom(), "room:in-a-valley");
  game.command("south");
  t.equal(game.currentRoom(), "room:at-slit-in-streambed");
  game.command("south");
  t.equal(game.currentRoom(), "room:outside-grate");
  t.end();
});

test("player has carrying capacity of 7", (t) => {
  const game = newGame();
  t.equal(game.getProperty("player:1", "carryingCapacity"), 7);
  t.end();
});

test("player starts with score 36", (t) => {
  const game = newGame();
  t.equal(game.getProperty("player:1", "score"), 36);
  t.end();
});

test("unlock grate and go below", (t) => {
  const game = newGame();
  game.command("west"); // inside building
  game.command("take keys");
  game.command("take lamp");
  game.command("east"); // end of road
  game.command("south"); // valley
  game.command("south"); // slit
  game.command("south"); // outside grate
  game.command("unlock grate");
  game.command("down"); // below grate
  t.equal(game.currentRoom(), "room:below-the-grate");
  const output = game.look();
  t.match(output, /small chamber/i);
  t.end();
});

test("debris room is dark without lamp", (t) => {
  const game = newGame();
  game.command("west");
  game.command("take keys");
  game.command("east");
  game.run(["south", "south", "south"]);
  game.command("unlock grate");
  game.run(["down", "west"]); // below grate, cobble crawl
  t.equal(game.currentRoom(), "room:in-cobble-crawl");
  game.command("west"); // debris room - dark!
  t.equal(game.currentRoom(), "room:in-debris-room");
  const output = game.look();
  t.match(output, /dark|pitch/i);
  t.end();
});

test("lamp lights dark rooms", (t) => {
  const game = newGame();
  game.command("west");
  game.command("take keys");
  game.command("take lamp");
  game.command("turn lamp");
  game.command("east");
  game.run(["south", "south", "south"]);
  game.command("unlock grate");
  game.run(["down", "west", "west"]); // debris room with lamp
  t.equal(game.currentRoom(), "room:in-debris-room");
  const output = game.look();
  t.match(output, /debris room/i);
  t.notMatch(output, /dark|pitch/i);
  t.end();
});

test("score command works", (t) => {
  const game = newGame();
  const output = game.command("score");
  t.match(output, /36/);
  t.match(output, /350/);
  t.end();
});

test("xyzzy teleports between building and debris room", (t) => {
  const game = newGame();
  game.command("west"); // inside building
  game.command("xyzzy");
  t.equal(game.currentRoom(), "room:in-debris-room");
  game.command("xyzzy");
  t.equal(game.currentRoom(), "room:inside-building");
  t.end();
});

test("plugh teleports between building and Y2", (t) => {
  const game = newGame();
  game.command("west"); // inside building
  game.command("plugh");
  t.equal(game.currentRoom(), "room:at-y2");
  game.command("plugh");
  t.equal(game.currentRoom(), "room:inside-building");
  t.end();
});

test("xyzzy does nothing in wrong location", (t) => {
  const game = newGame();
  const output = game.command("xyzzy");
  t.match(output, /nothing happens/i);
  t.equal(game.currentRoom(), "room:at-end-of-road");
  t.end();
});

test("fee fie foe foo returns eggs to giant room", (t) => {
  const game = newGame();
  // Move eggs out of giant room first
  game.store.setProperty("item:eggs", { name: "location", value: "player:1" });
  game.command("fee");
  game.command("fie");
  game.command("foe");
  game.command("foo");
  t.equal(game.getProperty("item:eggs", "location"), "room:in-giant-room");
  t.end();
});

test("catch bird with cage", (t) => {
  const game = newGame();
  // Get cage, go to bird chamber
  game.command("west");
  game.command("take keys");
  game.command("take lamp");
  game.command("turn lamp");
  game.command("east");
  game.run(["south", "south", "south"]);
  game.command("unlock grate");
  game.run(["down", "west"]); // cobble crawl
  game.command("take cage");
  game.run(["west", "west", "west"]); // debris -> canyon -> bird chamber
  const output = game.command("take bird");
  t.match(output, /catch the bird/i);
  t.equal(game.getProperty("item:bird", "location"), "item:cage");
  t.end();
});

test("bird drives away snake", (t) => {
  const game = newGame();
  game.command("west");
  game.command("take keys");
  game.command("take lamp");
  game.command("turn lamp");
  game.command("east");
  game.run(["south", "south", "south"]);
  game.command("unlock grate");
  game.run(["down", "west"]); // cobble crawl
  game.command("take cage");
  game.run(["west", "west", "west"]); // bird chamber
  game.command("take bird");
  game.run(["west", "down", "down"]); // small pit -> hall of mists -> mt king
  const output = game.command("release bird");
  t.match(output, /snake/i);
  t.equal(game.getProperty("item:snake", "location"), "void");
  t.end();
});

test("dragon can be slain", (t) => {
  const game = newGame();
  // Teleport to dragon location for quick test
  game.store.setProperty("player:1", { name: "location", value: "room:in-secret-canyon" });
  game.command("attack dragon");
  const output = game.command("yes");
  t.match(output, /vanquished/i);
  t.equal(game.getProperty("item:dragon", "location"), "void");
  t.end();
});

test("room count is substantial", (t) => {
  const game = newGame();
  const allIds = game.store.getAllIds();
  const rooms = allIds.filter((id) => id.startsWith("room:"));
  t.ok(rooms.length >= 70, `Expected at least 70 rooms, got ${rooms.length}`);
  t.end();
});
