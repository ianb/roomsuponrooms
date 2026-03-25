import { registerSerializer } from "agent-doctest/check";
import { createGameRunner } from "../src/core/index.js";
import { getGame } from "../src/games/registry.js";
import "../src/games/test-world.js";
import "../src/games/colossal-cave/index.js";
import type { GameRunner } from "../src/core/index.js";

class GameNotRegisteredError extends Error {
  constructor(slug: string) {
    super(`Game "${slug}" is not registered`);
    this.name = "GameNotRegisteredError";
  }
}

/** A test-friendly wrapper around GameRunner with nicer output for doctests */
export class TestGame {
  runner: GameRunner;

  constructor(runner: GameRunner) {
    this.runner = runner;
  }

  /** Send a command and return the narrative output */
  do(input: string): string {
    return this.runner.command(input);
  }

  /** Run multiple commands silently, return only the last output */
  walk(...commands: string[]): string {
    let last = "";
    for (const cmd of commands) {
      last = this.runner.command(cmd);
    }
    return last;
  }

  /** Get the current room ID */
  get room(): string {
    return this.runner.currentRoom();
  }

  /** Get the current room name */
  get roomName(): string {
    const room = this.runner.store.get(this.room);
    return (room.properties["name"] as string) || this.room;
  }

  /** Get inventory as a list of item names */
  get inventory(): string[] {
    const player = this.runner.store.findByTag("player")[0];
    if (!player) return [];
    const contents = this.runner.store.getContents(player.id);
    return contents.map((e) => (e.properties["name"] as string) || e.id);
  }

  /** Check where an entity is */
  locationOf(entityId: string): string {
    return this.runner.getProperty(entityId, "location") as string;
  }

  /** Get a property of an entity */
  prop(entityId: string, property: string): unknown {
    return this.runner.getProperty(entityId, property);
  }

  /** Get player score */
  get score(): number {
    const player = this.runner.store.findByTag("player")[0];
    if (!player) return 0;
    return (player.properties["score"] as number) || 0;
  }
}

/** Create a new test game for the sample world */
export function testWorld(): TestGame {
  const def = getGame("test");
  if (!def) throw new GameNotRegisteredError("test");
  return new TestGame(createGameRunner(def.create()));
}

/** Create a new test game for Colossal Cave */
export function colossalCave(): TestGame {
  const def = getGame("colossal-cave");
  if (!def) throw new GameNotRegisteredError("colossal-cave");
  return new TestGame(createGameRunner(def.create()));
}

// Register a serializer for TestGame so it prints nicely in doctests
registerSerializer((value) => {
  if (value instanceof TestGame) {
    const items = value.inventory;
    const inv = items.length > 0 ? `  carrying: ${items.join(", ")}` : "";
    return `[${value.roomName}]${inv}`;
  }
  return null;
});
