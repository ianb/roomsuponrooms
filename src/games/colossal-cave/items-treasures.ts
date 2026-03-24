import type { EntityStore } from "../../core/entity.js";
import { item } from "./item-helpers.js";

export function createTreasures(store: EntityStore): void {
  item(store, {
    id: "item:nugget",
    name: "Large gold nugget",
    description: "There is a large sparkling nugget of gold here!",
    location: "room:in-nugget-of-gold-room",
    portable: true,
    tags: ["treasure"],
    aliases: ["nugget", "large", "heavy"],
    properties: { depositPoints: 10 },
  });

  item(store, {
    id: "item:diamonds",
    name: "Several diamonds",
    description: "There are diamonds here!",
    location: "room:west-side-of-fissure",
    portable: true,
    tags: ["treasure"],
    aliases: ["diamond"],
    properties: { depositPoints: 10 },
  });

  item(store, {
    id: "item:silver",
    name: "Bars of silver",
    description: "There are bars of silver here!",
    location: "room:low-n-s-passage",
    portable: true,
    tags: ["treasure"],
    properties: { depositPoints: 10 },
  });

  item(store, {
    id: "item:jewelry",
    name: "Precious jewelry",
    description: "There is precious jewelry here!",
    location: "room:in-south-side-chamber",
    portable: true,
    tags: ["treasure"],
    aliases: ["jewel", "jewels"],
    properties: { depositPoints: 10 },
  });

  item(store, {
    id: "item:coins",
    name: "Rare coins",
    description: "There are many coins here!",
    location: "room:in-west-side-chamber",
    portable: true,
    tags: ["treasure"],
    aliases: ["coin", "coins"],
    properties: { depositPoints: 10 },
  });

  item(store, {
    id: "item:eggs",
    name: "Golden eggs",
    description: "There is a large nest here, full of golden eggs!",
    location: "room:in-giant-room",
    portable: true,
    tags: ["treasure"],
    aliases: ["egg", "nest"],
    properties: { depositPoints: 14 },
  });

  item(store, {
    id: "item:trident",
    name: "Jewel-encrusted trident",
    description: "There is a jewel-encrusted trident here!",
    location: "room:in-cavern-with-waterfall",
    portable: true,
    tags: ["treasure"],
    aliases: ["jeweled"],
    properties: { depositPoints: 14 },
  });

  item(store, {
    id: "item:vase",
    name: "Ming vase",
    description: "There is a delicate, precious, Ming dynasty vase here!",
    location: "room:in-oriental-room",
    portable: true,
    tags: ["treasure"],
    aliases: ["vase", "delicate"],
    properties: { depositPoints: 14 },
  });

  item(store, {
    id: "item:emerald",
    name: "Egg-sized emerald",
    description: "There is an emerald here the size of a plover's egg!",
    location: "room:in-plover-room",
    portable: true,
    tags: ["treasure"],
    aliases: ["plover"],
    properties: { depositPoints: 14 },
  });

  item(store, {
    id: "item:pyramid",
    name: "Platinum pyramid",
    description: "There is a platinum pyramid here, 8 inches on a side!",
    location: "room:in-dark-room",
    portable: true,
    tags: ["treasure"],
    aliases: ["pyramid"],
    properties: { depositPoints: 14 },
  });

  item(store, {
    id: "item:rug",
    name: "Persian rug",
    description: "There is a Persian rug spread out on the floor!",
    location: "room:in-secret-canyon",
    portable: true,
    tags: ["treasure"],
    aliases: ["rug", "fine"],
    properties: { depositPoints: 14 },
  });

  item(store, {
    id: "item:chest",
    name: "Treasure chest",
    description: "The pirate's treasure chest is here!",
    location: "room:dead-end-13",
    portable: true,
    tags: ["treasure"],
    aliases: ["box", "riches", "pirate"],
    properties: { depositPoints: 12 },
  });

  item(store, {
    id: "item:spices",
    name: "Rare spices",
    description: "There are rare spices here!",
    location: "room:in-chamber-of-boulders",
    portable: true,
    tags: ["treasure"],
    aliases: ["spice", "exotic"],
    properties: { depositPoints: 14 },
  });
}
