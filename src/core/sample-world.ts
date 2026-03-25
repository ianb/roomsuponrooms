import { EntityStore, WORLD_LOCATION } from "./entity.js";
import { createRegistry } from "./properties.js";
import { defineBaseProperties } from "./base-properties.js";
import { createDefaultVerbs } from "./default-verbs.js";
import type { VerbRegistry } from "./verbs.js";

interface SampleWorld {
  store: EntityStore;
  verbs: VerbRegistry;
}

function createRooms(store: EntityStore): void {
  store.create("room:clearing", {
    tags: ["room"],
    properties: {
      location: WORLD_LOCATION,
      name: "Forest Clearing",
      description:
        "You stand in a sunlit clearing surrounded by tall oaks. A weathered stone bench sits beneath the largest tree. Paths lead in several directions.",
    },
  });

  store.create("room:deep-woods", {
    tags: ["room"],
    properties: {
      location: WORLD_LOCATION,
      name: "Deep Woods",
      description:
        "The canopy above is thick, filtering the light into green shafts. The forest floor is soft with fallen leaves. An old wooden chest sits half-hidden among the roots.",
    },
  });

  store.create("room:hillside", {
    tags: ["room"],
    properties: {
      location: WORLD_LOCATION,
      name: "Rocky Hillside",
      description:
        "Loose stones shift under your feet as you climb a gentle slope. From here you can see the forest stretching out to the west. A small stone cabin stands at the top of the hill.",
    },
  });

  store.create("room:cabin", {
    tags: ["room"],
    properties: {
      location: WORLD_LOCATION,
      name: "Stone Cabin",
      description:
        "The interior of the cabin is sparse but cozy. A fireplace dominates one wall, and a rough wooden table sits in the center. Dusty shelves line the walls.",
    },
  });
}

function createExits(store: EntityStore): void {
  store.create("exit:clearing:to-deep-woods", {
    tags: ["exit"],
    properties: {
      location: "room:clearing",
      direction: "north",
      destination: "room:deep-woods",
      shortDescription: "into the deep woods",
    },
  });
  store.create("exit:clearing:to-hillside", {
    tags: ["exit"],
    properties: {
      location: "room:clearing",
      direction: "east",
      destination: "room:hillside",
      shortDescription: "toward a rocky hillside",
    },
  });
  store.create("exit:deep-woods:to-clearing", {
    tags: ["exit"],
    properties: {
      location: "room:deep-woods",
      direction: "south",
      destination: "room:clearing",
      shortDescription: "back to the clearing",
    },
  });
  store.create("exit:hillside:to-clearing", {
    tags: ["exit"],
    properties: {
      location: "room:hillside",
      direction: "west",
      destination: "room:clearing",
      shortDescription: "down to the clearing",
    },
  });
  store.create("exit:hillside:to-cabin", {
    tags: ["exit", "openable"],
    properties: {
      location: "room:hillside",
      direction: "enter",
      destination: "room:cabin",
      name: "Cabin Door",
      aliases: ["door"],
      locked: true,
      unlockedBy: "item:key",
      shortDescription: "${self.locked ? 'a locked cabin door' : 'the cabin'}",
    },
  });
  store.create("exit:cabin:to-hillside", {
    tags: ["exit"],
    properties: {
      location: "room:cabin",
      direction: "out",
      destination: "room:hillside",
      shortDescription: "to the hillside",
    },
  });
}

function createItems(store: EntityStore): void {
  store.create("item:lantern", {
    tags: ["portable"],
    properties: {
      location: "room:clearing",
      name: "Lantern",
      aliases: ["lamp", "brass lantern"],
      description: "A brass lantern, slightly tarnished but still functional.",
    },
  });

  store.create("item:chest", {
    tags: ["container", "openable"],
    properties: {
      location: "room:deep-woods",
      name: "Wooden Chest",
      aliases: ["box"],
      description: "A sturdy wooden chest with iron bands. It looks old but well-made.",
      open: false,
      locked: true,
      unlockedBy: "item:key",
    },
  });

  store.create("item:key", {
    tags: ["portable"],
    properties: {
      location: "room:clearing",
      name: "Iron Key",
      description: "A heavy iron key with an ornate handle.",
    },
  });

  store.create("item:coin", {
    tags: ["portable"],
    properties: {
      location: "room:hillside",
      name: "Silver Coin",
      description: "A tarnished silver coin with an unfamiliar crest.",
    },
  });

  store.create("item:rope", {
    tags: ["portable"],
    properties: {
      location: "room:deep-woods",
      name: "Coil of Rope",
      aliases: ["rope", "coil"],
      description: "A sturdy hemp rope, about thirty feet long.",
    },
  });

  store.create("item:flask", {
    tags: ["portable", "container", "openable"],
    properties: {
      location: "room:cabin",
      name: "Glass Flask",
      aliases: ["flask", "bottle", "vial"],
      description: "A small glass flask with a cork stopper. It contains a shimmering blue liquid.",
      open: false,
    },
  });

  store.create("item:potion", {
    tags: ["portable"],
    properties: {
      location: "item:flask",
      name: "Blue Potion",
      aliases: ["potion", "liquid", "blue"],
      description: "A shimmering blue liquid that seems to glow faintly.",
    },
  });

  store.create("item:stone", {
    tags: ["portable"],
    properties: {
      location: "room:hillside",
      name: "Smooth Stone",
      aliases: ["stone", "rock", "pebble"],
      description: "A smooth, palm-sized stone. It feels oddly warm to the touch.",
    },
  });

  store.create("item:mirror", {
    tags: ["portable"],
    properties: {
      location: "room:cabin",
      name: "Hand Mirror",
      aliases: ["mirror", "looking glass"],
      description:
        "A tarnished hand mirror with an ornate silver frame. Your reflection looks back at you, slightly distorted.",
    },
  });

  store.create("item:candle", {
    tags: ["portable"],
    properties: {
      location: "room:cabin",
      name: "Beeswax Candle",
      aliases: ["candle", "wax"],
      description:
        "${self.lit ? 'A beeswax candle burns with a steady golden flame.' : 'A thick beeswax candle, unlit. It smells faintly of honey.'}",
      lit: false,
    },
  });

  store.create("item:tinderbox", {
    tags: ["portable", "flame-source"],
    properties: {
      location: "room:clearing",
      name: "Tinderbox",
      aliases: ["tinder", "flint", "matches"],
      description: "A small brass tinderbox with flint and steel inside.",
    },
  });

  store.create("player", {
    tags: ["player"],
    properties: { location: "room:clearing", name: "You" },
  });
}

export function createSampleWorld(): SampleWorld {
  const registry = createRegistry();
  defineBaseProperties(registry);

  const store = new EntityStore(registry, 1);
  createRooms(store);
  createExits(store);
  createItems(store);

  store.snapshot();
  const verbs = createDefaultVerbs();

  return { store, verbs };
}
