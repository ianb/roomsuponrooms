import type { EntityStore } from "../../core/entity.js";
import { item } from "./item-helpers.js";
import { createTreasures } from "./items-treasures.js";

function createBuildingItems(store: EntityStore): void {
  item(store, {
    id: "item:keys",
    name: "Set of keys",
    description: "There are some keys on the ground here.",
    location: "room:inside-building",
    portable: true,
    aliases: ["key", "keyring", "bunch"],
  });

  item(store, {
    id: "item:food",
    name: "Tasty food",
    description: "There is food here.",
    location: "room:inside-building",
    portable: true,
    tags: ["edible"],
    aliases: ["ration", "rations", "tripe"],
  });

  item(store, {
    id: "item:lantern",
    name: "Brass lantern",
    description: "There is a shiny brass lamp nearby.",
    location: "room:inside-building",
    portable: true,
    tags: ["device"],
    aliases: ["lamp", "headlamp", "light"],
    properties: { switchedOn: false, lit: false, powerRemaining: 330 },
  });

  item(store, {
    id: "item:bottle",
    name: "Small bottle",
    description: "There is a bottle of water here.",
    location: "room:inside-building",
    portable: true,
    tags: ["container"],
    aliases: ["jar", "flask"],
    properties: { open: true },
  });

  item(store, {
    id: "item:water",
    name: "Water",
    description: "The bottle is full of water.",
    location: "item:bottle",
    portable: true,
    tags: ["edible"],
    aliases: ["water", "h2o"],
  });
}

function createCaveItems(store: EntityStore): void {
  item(store, {
    id: "item:cage",
    name: "Wicker cage",
    description: "There is a small wicker cage discarded nearby.",
    location: "room:in-cobble-crawl",
    portable: true,
    tags: ["container", "openable"],
    aliases: ["cage", "small"],
    properties: { open: true },
  });

  item(store, {
    id: "item:rod",
    name: "Black rod",
    description: "A three foot black rod with a rusty star on an end lies nearby.",
    location: "room:in-debris-room",
    portable: true,
    aliases: ["star", "rusty", "iron", "rod"],
  });

  item(store, {
    id: "item:bird",
    name: "Little bird",
    description: "A cheerful little bird is sitting here singing.",
    location: "room:in-bird-chamber",
    aliases: ["bird", "cheerful"],
  });

  item(store, {
    id: "item:pillow",
    name: "Velvet pillow",
    description: "A small velvet pillow lies on the floor.",
    location: "room:in-soft-room",
    portable: true,
    aliases: ["pillow", "small"],
  });

  item(store, {
    id: "item:bivalve",
    name: "Giant clam",
    description: "There is an enormous clam here with its shell tightly closed.",
    location: "room:in-shell-room",
    portable: true,
    aliases: ["clam", "oyster"],
  });
}

function createFixedItems(store: EntityStore): void {
  item(store, {
    id: "item:chain",
    name: "Golden chain",
    description: "There is a golden chain lying in a heap on the floor!",
    location: "room:in-barren-room",
    tags: ["treasure"],
    aliases: ["chain", "links", "gold"],
    properties: {
      fixed: true,
      locked: true,
      unlockedBy: "item:keys",
      depositPoints: 14,
    },
  });

  item(store, {
    id: "item:machine",
    name: "Vending machine",
    description: "There is a massive vending machine here.",
    location: "room:dead-end-14",
    tags: ["container"],
    properties: { fixed: true, open: false },
  });

  item(store, {
    id: "item:batteries-fresh",
    name: "Fresh batteries",
    description: "There are fresh batteries here.",
    location: "item:machine",
    portable: true,
    aliases: ["battery"],
  });

  item(store, {
    id: "item:oil",
    name: "Pool of oil",
    description: "There is a pool of oil here.",
    location: "room:in-east-pit",
    properties: { fixed: true },
  });

  item(store, {
    id: "item:plant",
    name: "Plant",
    description: 'There is a tiny little plant in the pit, murmuring "water, water, ..."',
    location: "room:in-west-pit",
    properties: { fixed: true, plantSize: "tiny" },
  });
}

export function createItems(store: EntityStore): void {
  createBuildingItems(store);
  createCaveItems(store);
  createFixedItems(store);
  createTreasures(store);
}
