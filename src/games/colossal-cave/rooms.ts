import type { EntityStore } from "../../core/entity.js";
import { createOutsideRooms } from "./rooms-outside.js";
import { createUpperCaveRooms } from "./rooms-upper-cave.js";
import { createHallsRooms } from "./rooms-halls.js";
import { createMazeRooms } from "./rooms-maze.js";
import { createDifferentMazeRooms } from "./rooms-different-maze.js";
import { createBedquiltRooms } from "./rooms-bedquilt.js";
import { createSecretCanyonRooms } from "./rooms-secret-canyons.js";
import { createGiantAreaRooms } from "./rooms-giant.js";
import { createChasmAreaRooms } from "./rooms-chasm.js";
import { createEndgameRooms } from "./rooms-endgame.js";

export function createAllRooms(store: EntityStore): void {
  createOutsideRooms(store);
  createUpperCaveRooms(store);
  createHallsRooms(store);
  createMazeRooms(store);
  createDifferentMazeRooms(store);
  createBedquiltRooms(store);
  createSecretCanyonRooms(store);
  createGiantAreaRooms(store);
  createChasmAreaRooms(store);
  createEndgameRooms(store);
}
