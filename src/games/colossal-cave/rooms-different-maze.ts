import type { EntityStore } from "../../core/entity.js";
import { undergroundRoom, exit } from "./room-helpers.js";

const DESCRIPTIONS: Record<number, string> = {
  1: "You are in a maze of twisty little passages, all different.",
  2: "You are in a little maze of twisting passages, all different.",
  3: "You are in a maze of twisting little passages, all different.",
  4: "You are in a little maze of twisty passages, all different.",
  5: "You are in a twisting maze of little passages, all different.",
  6: "You are in a twisting little maze of passages, all different.",
  7: "You are in a twisty little maze of passages, all different.",
  8: "You are in a twisty maze of little passages, all different.",
  9: "You are in a little twisty maze of passages, all different.",
  10: "You are in a maze of little twisting passages, all different.",
  11: "You are in a maze of little twisty passages, all different.",
};

function createRooms(store: EntityStore): void {
  for (let i = 1; i <= 11; i++) {
    undergroundRoom(store, {
      id: `room:different-maze-${i}`,
      name: "Maze",
      description: DESCRIPTIONS[i] || "You are in a maze of twisty little passages, all different.",
    });
  }
}

/* Each different maze room connects to all 10 others plus one external room.
   The connections form a complete graph with unique direction per room. */
type DirMap = [string, string][];

const MAZE_EXITS: Record<number, DirMap> = {
  1: [
    ["south", "room:different-maze-3"],
    ["southwest", "room:different-maze-4"],
    ["northeast", "room:different-maze-5"],
    ["southeast", "room:different-maze-6"],
    ["up", "room:different-maze-7"],
    ["northwest", "room:different-maze-8"],
    ["east", "room:different-maze-9"],
    ["west", "room:different-maze-10"],
    ["north", "room:different-maze-11"],
    ["down", "room:at-west-end-of-long-hall"],
  ],
  2: [
    ["southwest", "room:different-maze-3"],
    ["north", "room:different-maze-4"],
    ["east", "room:different-maze-5"],
    ["northwest", "room:different-maze-6"],
    ["southeast", "room:different-maze-7"],
    ["northeast", "room:different-maze-8"],
    ["west", "room:different-maze-9"],
    ["down", "room:different-maze-10"],
    ["up", "room:different-maze-11"],
    ["south", "room:dead-end-14"],
  ],
  3: [
    ["west", "room:different-maze-1"],
    ["southeast", "room:different-maze-4"],
    ["northwest", "room:different-maze-5"],
    ["southwest", "room:different-maze-6"],
    ["northeast", "room:different-maze-7"],
    ["up", "room:different-maze-8"],
    ["down", "room:different-maze-9"],
    ["north", "room:different-maze-10"],
    ["south", "room:different-maze-11"],
    ["east", "room:different-maze-2"],
  ],
  4: [
    ["northwest", "room:different-maze-1"],
    ["up", "room:different-maze-3"],
    ["north", "room:different-maze-5"],
    ["south", "room:different-maze-6"],
    ["west", "room:different-maze-7"],
    ["southwest", "room:different-maze-8"],
    ["northeast", "room:different-maze-9"],
    ["east", "room:different-maze-10"],
    ["down", "room:different-maze-11"],
    ["southeast", "room:different-maze-2"],
  ],
  5: [
    ["up", "room:different-maze-1"],
    ["down", "room:different-maze-3"],
    ["west", "room:different-maze-4"],
    ["northeast", "room:different-maze-6"],
    ["southwest", "room:different-maze-7"],
    ["east", "room:different-maze-8"],
    ["north", "room:different-maze-9"],
    ["northwest", "room:different-maze-10"],
    ["southeast", "room:different-maze-11"],
    ["south", "room:different-maze-2"],
  ],
  6: [
    ["northeast", "room:different-maze-1"],
    ["north", "room:different-maze-3"],
    ["northwest", "room:different-maze-4"],
    ["southeast", "room:different-maze-5"],
    ["east", "room:different-maze-7"],
    ["down", "room:different-maze-8"],
    ["south", "room:different-maze-9"],
    ["up", "room:different-maze-10"],
    ["west", "room:different-maze-11"],
    ["southwest", "room:different-maze-2"],
  ],
  7: [
    ["north", "room:different-maze-1"],
    ["southeast", "room:different-maze-3"],
    ["down", "room:different-maze-4"],
    ["south", "room:different-maze-5"],
    ["east", "room:different-maze-6"],
    ["west", "room:different-maze-8"],
    ["southwest", "room:different-maze-9"],
    ["northeast", "room:different-maze-10"],
    ["northwest", "room:different-maze-11"],
    ["up", "room:different-maze-2"],
  ],
  8: [
    ["east", "room:different-maze-1"],
    ["west", "room:different-maze-3"],
    ["up", "room:different-maze-4"],
    ["southwest", "room:different-maze-5"],
    ["down", "room:different-maze-6"],
    ["south", "room:different-maze-7"],
    ["northwest", "room:different-maze-9"],
    ["southeast", "room:different-maze-10"],
    ["northeast", "room:different-maze-11"],
    ["north", "room:different-maze-2"],
  ],
  9: [
    ["southeast", "room:different-maze-1"],
    ["northeast", "room:different-maze-3"],
    ["south", "room:different-maze-4"],
    ["down", "room:different-maze-5"],
    ["up", "room:different-maze-6"],
    ["northwest", "room:different-maze-7"],
    ["north", "room:different-maze-8"],
    ["southwest", "room:different-maze-10"],
    ["east", "room:different-maze-11"],
    ["west", "room:different-maze-2"],
  ],
  10: [
    ["down", "room:different-maze-1"],
    ["east", "room:different-maze-3"],
    ["northeast", "room:different-maze-4"],
    ["up", "room:different-maze-5"],
    ["west", "room:different-maze-6"],
    ["north", "room:different-maze-7"],
    ["south", "room:different-maze-8"],
    ["southeast", "room:different-maze-9"],
    ["southwest", "room:different-maze-11"],
    ["northwest", "room:different-maze-2"],
  ],
  11: [
    ["southwest", "room:different-maze-1"],
    ["northwest", "room:different-maze-3"],
    ["east", "room:different-maze-4"],
    ["west", "room:different-maze-5"],
    ["north", "room:different-maze-6"],
    ["down", "room:different-maze-7"],
    ["southeast", "room:different-maze-8"],
    ["up", "room:different-maze-9"],
    ["south", "room:different-maze-10"],
    ["northeast", "room:different-maze-2"],
  ],
};

function createExits(store: EntityStore): void {
  for (let i = 1; i <= 11; i++) {
    const from = `room:different-maze-${i}`;
    const exits = MAZE_EXITS[i];
    if (!exits) continue;
    for (const [direction, to] of exits) {
      exit(store, { from, direction, to });
    }
  }
}

export function createDifferentMazeRooms(store: EntityStore): void {
  createRooms(store);
  createExits(store);
}
