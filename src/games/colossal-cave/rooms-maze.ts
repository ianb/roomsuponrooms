import type { EntityStore } from "../../core/entity.js";
import { undergroundRoom, exit } from "./room-helpers.js";

const ALIKE_DESC = "You are in a maze of twisty little passages, all alike.";
const DEAD_END_DESC = "You have reached a dead end.";

function createAlikeMazeRooms(store: EntityStore): void {
  for (let i = 1; i <= 14; i++) {
    undergroundRoom(store, {
      id: `room:alike-maze-${i}`,
      name: "Maze",
      description: ALIKE_DESC,
    });
  }
  undergroundRoom(store, {
    id: "room:at-brink-of-pit",
    name: "At Brink of Pit",
    description:
      "You are on the brink of a thirty foot pit with a massive orange column down one wall. You could climb down here but you could not get back up. The maze continues at this level.",
  });
}

function createDeadEndRooms(store: EntityStore): void {
  const standardDeadEnds = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
  for (const n of standardDeadEnds) {
    undergroundRoom(store, {
      id: `room:dead-end-${n}`,
      name: "Dead End",
      description: DEAD_END_DESC,
    });
  }
  undergroundRoom(store, {
    id: "room:dead-end-13",
    name: "Dead End",
    description: "This is the pirate's dead end.",
    tags: ["safe"],
  });
  undergroundRoom(store, {
    id: "room:dead-end-14",
    name: "Dead End, near Vending Machine",
    description:
      "You have reached a dead end. There is a massive vending machine here.\n\nHmmm... There is a message here scrawled in the dust in a flowery script.",
    tags: ["safe"],
  });
}

function createAlikeMazeExits(store: EntityStore): void {
  // Maze 1
  exit(store, {
    from: "room:alike-maze-1",
    direction: "up",
    to: "room:at-west-end-of-hall-of-mists",
  });
  exit(store, { from: "room:alike-maze-1", direction: "north", to: "room:alike-maze-1" });
  exit(store, { from: "room:alike-maze-1", direction: "east", to: "room:alike-maze-2" });
  exit(store, { from: "room:alike-maze-1", direction: "south", to: "room:alike-maze-4" });
  exit(store, { from: "room:alike-maze-1", direction: "west", to: "room:alike-maze-11" });
  // Maze 2
  exit(store, { from: "room:alike-maze-2", direction: "west", to: "room:alike-maze-1" });
  exit(store, { from: "room:alike-maze-2", direction: "east", to: "room:alike-maze-4" });
  exit(store, { from: "room:alike-maze-2", direction: "south", to: "room:alike-maze-3" });
  // Maze 3
  exit(store, { from: "room:alike-maze-3", direction: "east", to: "room:alike-maze-2" });
  exit(store, { from: "room:alike-maze-3", direction: "down", to: "room:dead-end-3" });
  exit(store, { from: "room:alike-maze-3", direction: "south", to: "room:alike-maze-6" });
  exit(store, { from: "room:alike-maze-3", direction: "north", to: "room:dead-end-13" });
  // Maze 4
  exit(store, { from: "room:alike-maze-4", direction: "west", to: "room:alike-maze-1" });
  exit(store, { from: "room:alike-maze-4", direction: "north", to: "room:alike-maze-2" });
  exit(store, { from: "room:alike-maze-4", direction: "east", to: "room:dead-end-1" });
  exit(store, { from: "room:alike-maze-4", direction: "south", to: "room:dead-end-2" });
  exit(store, { from: "room:alike-maze-4", direction: "up", to: "room:alike-maze-14" });
  exit(store, { from: "room:alike-maze-4", direction: "down", to: "room:alike-maze-14" });
  // Maze 5
  exit(store, { from: "room:alike-maze-5", direction: "east", to: "room:alike-maze-6" });
  exit(store, { from: "room:alike-maze-5", direction: "west", to: "room:alike-maze-7" });
  // Maze 6
  exit(store, { from: "room:alike-maze-6", direction: "east", to: "room:alike-maze-3" });
  exit(store, { from: "room:alike-maze-6", direction: "west", to: "room:alike-maze-5" });
  exit(store, { from: "room:alike-maze-6", direction: "down", to: "room:alike-maze-7" });
  exit(store, { from: "room:alike-maze-6", direction: "south", to: "room:alike-maze-8" });
  // Maze 7
  exit(store, { from: "room:alike-maze-7", direction: "west", to: "room:alike-maze-5" });
  exit(store, { from: "room:alike-maze-7", direction: "up", to: "room:alike-maze-6" });
  exit(store, { from: "room:alike-maze-7", direction: "east", to: "room:alike-maze-8" });
  exit(store, { from: "room:alike-maze-7", direction: "south", to: "room:alike-maze-9" });
  // Maze 8
  exit(store, { from: "room:alike-maze-8", direction: "west", to: "room:alike-maze-6" });
  exit(store, { from: "room:alike-maze-8", direction: "east", to: "room:alike-maze-7" });
  exit(store, { from: "room:alike-maze-8", direction: "south", to: "room:alike-maze-8" });
  exit(store, { from: "room:alike-maze-8", direction: "up", to: "room:alike-maze-9" });
  exit(store, { from: "room:alike-maze-8", direction: "north", to: "room:alike-maze-10" });
  // Maze 9
  exit(store, { from: "room:alike-maze-9", direction: "west", to: "room:alike-maze-7" });
  exit(store, { from: "room:alike-maze-9", direction: "north", to: "room:alike-maze-8" });
  exit(store, { from: "room:alike-maze-9", direction: "south", to: "room:dead-end-4" });
  // Maze 10
  exit(store, { from: "room:alike-maze-10", direction: "west", to: "room:alike-maze-8" });
  exit(store, { from: "room:alike-maze-10", direction: "north", to: "room:alike-maze-10" });
  exit(store, { from: "room:alike-maze-10", direction: "down", to: "room:dead-end-5" });
  exit(store, { from: "room:alike-maze-10", direction: "east", to: "room:at-brink-of-pit" });
  // Maze 11
  exit(store, { from: "room:alike-maze-11", direction: "north", to: "room:alike-maze-1" });
  exit(store, { from: "room:alike-maze-11", direction: "south", to: "room:alike-maze-11" });
  exit(store, { from: "room:alike-maze-11", direction: "west", to: "room:alike-maze-11" });
  exit(store, { from: "room:alike-maze-11", direction: "east", to: "room:dead-end-9" });
  exit(store, { from: "room:alike-maze-11", direction: "northeast", to: "room:dead-end-10" });
  // Maze 12
  exit(store, { from: "room:alike-maze-12", direction: "south", to: "room:at-brink-of-pit" });
  exit(store, { from: "room:alike-maze-12", direction: "east", to: "room:alike-maze-13" });
  exit(store, { from: "room:alike-maze-12", direction: "west", to: "room:dead-end-11" });
  // Maze 13
  exit(store, { from: "room:alike-maze-13", direction: "north", to: "room:at-brink-of-pit" });
  exit(store, { from: "room:alike-maze-13", direction: "northwest", to: "room:dead-end-13" });
  // Maze 14
  exit(store, { from: "room:alike-maze-14", direction: "up", to: "room:alike-maze-4" });
  exit(store, { from: "room:alike-maze-14", direction: "down", to: "room:alike-maze-4" });
  // Brink of Pit (one-way down to bird chamber)
  exit(store, { from: "room:at-brink-of-pit", direction: "down", to: "room:in-bird-chamber" });
  exit(store, { from: "room:at-brink-of-pit", direction: "south", to: "room:dead-end-6" });
  exit(store, { from: "room:at-brink-of-pit", direction: "north", to: "room:alike-maze-12" });
  exit(store, { from: "room:at-brink-of-pit", direction: "east", to: "room:alike-maze-13" });
}

function createDeadEndExits(store: EntityStore): void {
  exit(store, { from: "room:dead-end-1", direction: "west", to: "room:alike-maze-4" });
  exit(store, { from: "room:dead-end-2", direction: "west", to: "room:alike-maze-4" });
  exit(store, { from: "room:dead-end-3", direction: "up", to: "room:alike-maze-3" });
  exit(store, { from: "room:dead-end-4", direction: "west", to: "room:alike-maze-9" });
  exit(store, { from: "room:dead-end-5", direction: "up", to: "room:alike-maze-10" });
  exit(store, { from: "room:dead-end-6", direction: "east", to: "room:at-brink-of-pit" });
  exit(store, { from: "room:dead-end-8", direction: "south", to: "room:in-tall-ew-canyon" });
  exit(store, { from: "room:dead-end-9", direction: "west", to: "room:alike-maze-11" });
  exit(store, { from: "room:dead-end-10", direction: "south", to: "room:alike-maze-3" });
  exit(store, { from: "room:dead-end-11", direction: "east", to: "room:alike-maze-12" });
  exit(store, { from: "room:dead-end-13", direction: "south", to: "room:alike-maze-3" });
  exit(store, { from: "room:dead-end-14", direction: "north", to: "room:different-maze-2" });
}

export function createMazeRooms(store: EntityStore): void {
  createAlikeMazeRooms(store);
  createDeadEndRooms(store);
  createAlikeMazeExits(store);
  createDeadEndExits(store);
}
