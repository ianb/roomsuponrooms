import { test } from "tap";
import { createSampleWorld, createGameRunner } from "../src/core/index.js";

function newGame() {
  const world = createSampleWorld();
  return createGameRunner(world);
}

test("starts in the clearing", (t) => {
  const game = newGame();
  t.equal(game.currentRoom(), "room:clearing");
  t.end();
});

test("move north to deep woods", (t) => {
  const game = newGame();
  game.command("north");
  t.equal(game.currentRoom(), "room:deep-woods");
  t.end();
});

test("move south back to clearing", (t) => {
  const game = newGame();
  game.command("north");
  game.command("south");
  t.equal(game.currentRoom(), "room:clearing");
  t.end();
});

test("direction aliases work", (t) => {
  const game = newGame();
  game.command("e");
  t.equal(game.currentRoom(), "room:hillside");
  t.end();
});

test("take item by alias", (t) => {
  const game = newGame();
  game.command("take lamp");
  t.equal(game.getProperty("item:lantern", "location"), "player");
  t.end();
});

test("locked exit blocks entry", (t) => {
  const game = newGame();
  game.command("e");
  const output = game.command("enter");
  t.match(output, /locked/i);
  t.equal(game.currentRoom(), "room:hillside");
  t.end();
});

test("unlock door with key and enter", (t) => {
  const game = newGame();
  game.command("take key");
  game.command("e");
  game.command("unlock door");
  game.command("enter");
  t.equal(game.currentRoom(), "room:cabin");
  t.end();
});

test("inventory shows carried items", (t) => {
  const game = newGame();
  game.command("take lantern");
  const output = game.command("inventory");
  t.match(output, /lantern/i);
  t.end();
});

test("visit count increments", (t) => {
  const game = newGame();
  game.command("north");
  t.equal(game.getProperty("room:deep-woods", "visits"), 1);
  game.command("south");
  game.command("north");
  t.equal(game.getProperty("room:deep-woods", "visits"), 2);
  t.end();
});
