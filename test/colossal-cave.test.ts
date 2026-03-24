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

test("room count is substantial", (t) => {
  const game = newGame();
  const allIds = game.store.getAllIds();
  const rooms = allIds.filter((id) => id.startsWith("room:"));
  t.ok(rooms.length >= 70, `Expected at least 70 rooms, got ${rooms.length}`);
  t.end();
});
