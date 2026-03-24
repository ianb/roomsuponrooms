import type { EntityStore } from "../../core/entity.js";
import { undergroundRoom, exit } from "./room-helpers.js";

function createRooms(store: EntityStore): void {
  undergroundRoom(store, {
    id: "room:on-sw-side-of-chasm",
    name: "On SW Side of Chasm",
    description:
      "You are on one side of a large, deep chasm. A heavy white mist rising up from below obscures all view of the far side. A southwest path leads away from the chasm into a winding corridor.",
  });
  undergroundRoom(store, {
    id: "room:on-ne-side-of-chasm",
    name: "On NE Side of Chasm",
    description:
      "You are on the far side of the chasm. A northeast path leads away from the chasm on this side.",
    tags: ["safe"],
  });
  undergroundRoom(store, {
    id: "room:in-corridor",
    name: "In Corridor",
    description:
      "You're in a long east/west corridor. A faint rumbling noise can be heard in the distance.",
    tags: ["safe"],
  });
  undergroundRoom(store, {
    id: "room:at-fork-in-path",
    name: "At Fork in Path",
    description:
      "The path forks here. The left fork leads northeast. A dull rumbling seems to get louder in that direction. The right fork leads southeast down a gentle slope. The main corridor enters from the west.",
    tags: ["safe"],
  });
  undergroundRoom(store, {
    id: "room:at-junction-with-warm-walls",
    name: "At Junction With Warm Walls",
    description:
      "The walls are quite warm here. From the north can be heard a steady roar, so loud that the entire cave seems to be trembling. Another passage leads south, and a low crawl goes east.",
    tags: ["safe"],
  });
  undergroundRoom(store, {
    id: "room:at-breath-taking-view",
    name: "At Breath-Taking View",
    description:
      "You are on the edge of a breath-taking view. Far below you is an active volcano, from which great gouts of molten lava come surging out, cascading back down into the depths. The glowing rock fills the farthest reaches of the cavern with a blood-red glare, giving everything an eerie, macabre appearance. The air is filled with flickering sparks of ash and a heavy smell of brimstone. The walls are hot to the touch, and the thundering of the volcano drowns out all other sounds. Embedded in the jagged roof far overhead are myriad twisted formations composed of pure white alabaster, which scatter the murky light into sinister apparitions upon the walls. To one side is a deep gorge, filled with a bizarre chaos of tortured rock which seems to have been crafted by the devil himself. An immense river of fire crashes out from the depths of the volcano, burns its way through the gorge, and plummets into a bottomless pit far off to your left. To the right, an immense geyser of blistering steam erupts continuously from a barren island in the center of a sulfurous lake, which bubbles ominously. The far right wall is aflame with an incandescence of its own, which lends an additional infernal splendor to the already hellish scene. A dark, forboding passage exits to the south.",
    tags: ["safe"],
    lit: true,
  });
  undergroundRoom(store, {
    id: "room:in-chamber-of-boulders",
    name: "In Chamber of Boulders",
    description:
      "You are in a small chamber filled with large boulders. The walls are very warm, causing the air in the room to be almost stifling from the heat. The only exit is a crawl heading west, through which is coming a low rumbling.",
    tags: ["safe"],
  });
  undergroundRoom(store, {
    id: "room:in-limestone-passage",
    name: "In Limestone Passage",
    description:
      "You are walking along a gently sloping north/south passage lined with oddly shaped limestone formations.",
    tags: ["safe"],
  });
  undergroundRoom(store, {
    id: "room:in-front-of-barren-room",
    name: "In Front of Barren Room",
    description:
      "You are standing at the entrance to a large, barren room. A sign posted above the entrance reads: 'Caution! Bear in room!'",
    tags: ["safe"],
  });
  undergroundRoom(store, {
    id: "room:in-barren-room",
    name: "In Barren Room",
    description:
      "You are inside a barren room. The center of the room is completely empty except for some dust. Marks in the dust lead away toward the far end of the room. The only exit is the way you came in.",
    tags: ["safe"],
  });
}

function createExits(store: EntityStore): void {
  // SW Side of Chasm (northeast across chasm is a door - skip)
  exit(store, {
    from: "room:on-sw-side-of-chasm",
    direction: "southwest",
    to: "room:in-sloping-corridor",
  });
  // NE Side of Chasm
  exit(store, {
    from: "room:on-ne-side-of-chasm",
    direction: "northeast",
    to: "room:in-corridor",
  });
  // In Corridor
  exit(store, {
    from: "room:in-corridor",
    direction: "west",
    to: "room:on-ne-side-of-chasm",
  });
  exit(store, {
    from: "room:in-corridor",
    direction: "east",
    to: "room:at-fork-in-path",
  });
  // At Fork in Path
  exit(store, {
    from: "room:at-fork-in-path",
    direction: "west",
    to: "room:in-corridor",
  });
  exit(store, {
    from: "room:at-fork-in-path",
    direction: "northeast",
    to: "room:at-junction-with-warm-walls",
  });
  exit(store, {
    from: "room:at-fork-in-path",
    direction: "southeast",
    to: "room:in-limestone-passage",
  });
  exit(store, {
    from: "room:at-fork-in-path",
    direction: "down",
    to: "room:in-limestone-passage",
  });
  // At Junction With Warm Walls
  exit(store, {
    from: "room:at-junction-with-warm-walls",
    direction: "south",
    to: "room:at-fork-in-path",
  });
  exit(store, {
    from: "room:at-junction-with-warm-walls",
    direction: "north",
    to: "room:at-breath-taking-view",
  });
  exit(store, {
    from: "room:at-junction-with-warm-walls",
    direction: "east",
    to: "room:in-chamber-of-boulders",
  });
  // At Breath-Taking View
  exit(store, {
    from: "room:at-breath-taking-view",
    direction: "south",
    to: "room:at-junction-with-warm-walls",
  });
  // In Chamber of Boulders
  exit(store, {
    from: "room:in-chamber-of-boulders",
    direction: "west",
    to: "room:at-junction-with-warm-walls",
  });
  // In Limestone Passage
  exit(store, {
    from: "room:in-limestone-passage",
    direction: "north",
    to: "room:at-fork-in-path",
  });
  exit(store, {
    from: "room:in-limestone-passage",
    direction: "up",
    to: "room:at-fork-in-path",
  });
  exit(store, {
    from: "room:in-limestone-passage",
    direction: "south",
    to: "room:in-front-of-barren-room",
  });
  exit(store, {
    from: "room:in-limestone-passage",
    direction: "down",
    to: "room:in-front-of-barren-room",
  });
  // In Front of Barren Room
  exit(store, {
    from: "room:in-front-of-barren-room",
    direction: "west",
    to: "room:in-limestone-passage",
  });
  exit(store, {
    from: "room:in-front-of-barren-room",
    direction: "east",
    to: "room:in-barren-room",
  });
  // In Barren Room
  exit(store, {
    from: "room:in-barren-room",
    direction: "west",
    to: "room:in-front-of-barren-room",
  });
}

export function createChasmAreaRooms(store: EntityStore): void {
  createRooms(store);
  createExits(store);
}
