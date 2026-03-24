import {
  EntityStore,
  createRegistry,
  defineBaseProperties,
  createDefaultVerbs,
} from "../../core/index.js";
import { createAllRooms } from "./rooms.js";
import { createItems } from "./items.js";
import { createDoors } from "./doors.js";
import { xyzzy, plugh, plover, fee, fie, foe, foo, oldMagic } from "./magic-words.js";
import { catchBird, releaseBird, waterPlant, attackDragon, sayYes, feedBear } from "./puzzles.js";
import { registerGame } from "../registry.js";

registerGame({
  slug: "colossal-cave",
  title: "Colossal Cave Adventure",
  description:
    "The classic text adventure by Will Crowther and Don Woods. Explore a vast cave system, collect treasures, and avoid dangers.",
  create() {
    const registry = createRegistry();
    defineBaseProperties(registry);
    const store = new EntityStore(registry);
    const verbs = createDefaultVerbs();
    const puzzleHandlers = [catchBird, releaseBird, waterPlant, attackDragon, sayYes, feedBear];
    for (const handler of [xyzzy, plugh, plover, fee, fie, foe, foo, oldMagic, ...puzzleHandlers]) {
      verbs.register(handler);
    }

    createAllRooms(store);
    createItems(store);
    createDoors(store);

    // Create the player
    store.create("player:1", {
      tags: ["player"],
      properties: {
        location: "room:at-end-of-road",
        name: "Adventurer",
        carryingCapacity: 7,
        score: 36,
        maxScore: 350,
      },
    });

    return { store, verbs };
  },
});
