import type { EntityStore } from "../../core/entity.js";

/**
 * Creates door entities for Colossal Cave.
 * Doors are exit entities with locked/open properties.
 * Some doors need special verb handlers for their puzzles.
 */
export function createDoors(store: EntityStore): void {
  // Steel grate: between Outside Grate and Below The Grate
  // Locked by default, unlocked by keys
  store.create("door:grate:down", {
    tags: ["exit", "openable", "door"],
    properties: {
      location: "room:outside-grate",
      direction: "down",
      destination: "room:below-the-grate",
      name: "Steel Grate",
      aliases: ["grate", "grille", "metal", "grating"],
      description: "It just looks like an ordinary grate mounted in concrete.",
      locked: true,
      open: false,
      unlockedBy: "item:keys",
      pairedDoor: "door:grate:up",
    },
  });

  store.create("door:grate:up", {
    tags: ["exit", "openable", "door"],
    properties: {
      location: "room:below-the-grate",
      direction: "up",
      destination: "room:outside-grate",
      name: "Steel Grate",
      aliases: ["grate", "grille", "metal", "grating"],
      description: "It just looks like an ordinary grate mounted in concrete.",
      locked: true,
      open: false,
      unlockedBy: "item:keys",
      pairedDoor: "door:grate:down",
    },
  });

  // Rusty door: between Immense N/S Passage and Cavern With Waterfall
  // Locked by default, unlocked by oiling (special verb handler)
  store.create("door:rusty-door:north", {
    tags: ["exit", "openable", "door"],
    properties: {
      location: "room:in-immense-n-s-passage",
      direction: "north",
      destination: "room:in-cavern-with-waterfall",
      name: "Rusty Door",
      aliases: ["door", "iron", "massive"],
      description: "It's just a big iron door.",
      locked: true,
      open: false,
      pairedDoor: "door:rusty-door:south",
    },
  });

  store.create("door:rusty-door:south", {
    tags: ["exit", "openable", "door"],
    properties: {
      location: "room:in-cavern-with-waterfall",
      direction: "south",
      destination: "room:in-immense-n-s-passage",
      name: "Rusty Door",
      aliases: ["door", "iron", "massive"],
      description: "It's just a big iron door.",
      locked: true,
      open: false,
      pairedDoor: "door:rusty-door:north",
    },
  });
}
