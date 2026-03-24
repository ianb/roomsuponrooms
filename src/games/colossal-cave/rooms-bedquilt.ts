import type { EntityStore } from "../../core/entity.js";
import { undergroundRoom, exit } from "./room-helpers.js";

function createRooms(store: EntityStore): void {
  undergroundRoom(store, {
    id: "room:at-complex-junction",
    name: "At Complex Junction",
    description:
      "You are at a complex junction. A low hands and knees passage from the north joins a higher crawl from the east to make a walking passage going west. There is also a large room above. The air is damp here.",
  });
  undergroundRoom(store, {
    id: "room:in-bedquilt",
    name: "Bedquilt",
    description:
      "You are in bedquilt, a long east/west passage with holes everywhere. To explore at random select north, south, up, or down.",
  });
  undergroundRoom(store, {
    id: "room:in-swiss-cheese-room",
    name: "In Swiss Cheese Room",
    description:
      "You are in a room whose walls resemble swiss cheese. Obvious passages go west, east, ne, and nw. Part of the room is occupied by a large bedrock block.",
  });
  undergroundRoom(store, {
    id: "room:at-west-end-of-twopit-room",
    name: "At West End of Twopit Room",
    description:
      "You are at the west end of the twopit room. There is a large hole in the wall above the pit at this end of the room.",
  });
  undergroundRoom(store, {
    id: "room:at-east-end-of-twopit-room",
    name: "At East End of Twopit Room",
    description:
      "You are at the east end of the twopit room. The floor here is littered with thin rock slabs, which make it easy to descend the pits. There is a path here bypassing the pits to connect passages from east and west. There are holes all over, but the only big one is on the wall directly over the west pit where you can't get to it.",
  });
  undergroundRoom(store, {
    id: "room:in-west-pit",
    name: "In West Pit",
    description:
      "You are at the bottom of the western pit in the twopit room. There is a large hole in the wall about 25 feet above you.",
    tags: ["safe"],
  });
  undergroundRoom(store, {
    id: "room:in-east-pit",
    name: "In East Pit",
    description:
      "You are at the bottom of the eastern pit in the twopit room. There is a small pool of oil in one corner of the pit.",
    tags: ["safe"],
  });
  undergroundRoom(store, {
    id: "room:in-slab-room",
    name: "Slab Room",
    description:
      "You are in a large low circular chamber whose floor is an immense slab fallen from the ceiling (slab room). East and west there once were large passages, but they are now filled with boulders. Low small passages go north and south, and the south one quickly bends west around the boulders.",
  });
  undergroundRoom(store, {
    id: "room:in-soft-room",
    name: "In Soft Room",
    description:
      "You are in the soft room. The walls are covered with heavy curtains, the floor with a thick pile carpet. Moss covers the ceiling.",
  });
  undergroundRoom(store, {
    id: "room:in-oriental-room",
    name: "Oriental Room",
    description:
      "This is the oriental room. Ancient oriental cave drawings cover the walls. A gently sloping passage leads upward to the north, another passage leads se, and a hands and knees crawl leads west.",
  });
  undergroundRoom(store, {
    id: "room:in-misty-cavern",
    name: "Misty Cavern",
    description:
      "You are following a wide path around the outer edge of a large cavern. Far below, through a heavy white mist, strange splashing noises can be heard. The mist rises up through a fissure in the ceiling. The path exits to the south and west.",
  });
  undergroundRoom(store, {
    id: "room:in-alcove",
    name: "Alcove",
    description:
      "You are in an alcove. A small northwest path seems to widen after a short distance. An extremely tight tunnel leads east. It looks like a very tight squeeze. An eerie light can be seen at the other end.",
  });
  undergroundRoom(store, {
    id: "room:in-plover-room",
    name: "Plover Room",
    description:
      "You're in a small chamber lit by an eerie green light. An extremely narrow tunnel exits to the west. A dark corridor leads northeast.",
    tags: ["lighted"],
  });
  undergroundRoom(store, {
    id: "room:in-dark-room",
    name: "The Dark Room",
    description: "You're in the dark-room. A corridor leading south is the only exit.",
    tags: ["safe"],
  });
  undergroundRoom(store, {
    id: "room:in-arched-hall",
    name: "Arched Hall",
    description:
      "You are in an arched hall. A coral passage once continued up and east from here, but is now blocked by debris. The air smells of sea water.",
  });
  undergroundRoom(store, {
    id: "room:in-shell-room",
    name: "Shell Room",
    description:
      "You're in a large room carved out of sedimentary rock. The floor and walls are littered with bits of shells imbedded in the stone. A shallow passage proceeds downward, and a somewhat steeper one leads up. A low hands and knees passage enters from the south.",
  });
  undergroundRoom(store, {
    id: "room:in-ragged-corridor",
    name: "Ragged Corridor",
    description: "You are in a long sloping corridor with ragged sharp walls.",
  });
  undergroundRoom(store, {
    id: "room:in-a-cul-de-sac",
    name: "Cul-de-Sac",
    description: "You are in a cul-de-sac about eight feet across.",
  });
  undergroundRoom(store, {
    id: "room:in-anteroom",
    name: "In Anteroom",
    description:
      "You are in an anteroom leading to a large passage to the east. Small passages go west and up. The remnants of recent digging are evident.",
  });
  undergroundRoom(store, {
    id: "room:at-witts-end",
    name: "At Witt's End",
    description: "You are at Witt's End. Passages lead off in *all* directions.",
  });
  undergroundRoom(store, {
    id: "room:in-large-low-room",
    name: "Large Low Room",
    description: "You are in a large low room. Crawls lead north, se, and sw.",
  });
  undergroundRoom(store, {
    id: "room:dead-end-crawl",
    name: "Dead End Crawl",
    description: "This is a dead end crawl.",
  });
}

function createExits(store: EntityStore): void {
  // Complex Junction
  exit(store, { from: "room:at-complex-junction", direction: "up", to: "room:in-dusty-rock-room" });
  exit(store, { from: "room:at-complex-junction", direction: "west", to: "room:in-bedquilt" });
  exit(store, { from: "room:at-complex-junction", direction: "north", to: "room:in-shell-room" });
  exit(store, { from: "room:at-complex-junction", direction: "east", to: "room:in-anteroom" });
  // Bedquilt
  exit(store, { from: "room:in-bedquilt", direction: "east", to: "room:at-complex-junction" });
  exit(store, { from: "room:in-bedquilt", direction: "west", to: "room:in-swiss-cheese-room" });
  exit(store, { from: "room:in-bedquilt", direction: "south", to: "room:in-slab-room" });
  exit(store, { from: "room:in-bedquilt", direction: "up", to: "room:in-secret-ns-canyon-1" });
  exit(store, { from: "room:in-bedquilt", direction: "north", to: "room:in-large-low-room" });
  exit(store, { from: "room:in-bedquilt", direction: "down", to: "room:in-anteroom" });
  // Swiss Cheese Room
  exit(store, {
    from: "room:in-swiss-cheese-room",
    direction: "west",
    to: "room:at-west-end-of-twopit-room",
  });
  exit(store, {
    from: "room:in-swiss-cheese-room",
    direction: "south",
    to: "room:in-tall-ew-canyon",
  });
  exit(store, {
    from: "room:in-swiss-cheese-room",
    direction: "northeast",
    to: "room:in-bedquilt",
  });
  exit(store, { from: "room:in-swiss-cheese-room", direction: "east", to: "room:in-soft-room" });
  exit(store, {
    from: "room:in-swiss-cheese-room",
    direction: "northwest",
    to: "room:in-oriental-room",
  });
  // Twopit Room West
  exit(store, {
    from: "room:at-west-end-of-twopit-room",
    direction: "east",
    to: "room:at-east-end-of-twopit-room",
  });
  exit(store, {
    from: "room:at-west-end-of-twopit-room",
    direction: "west",
    to: "room:in-slab-room",
  });
  exit(store, {
    from: "room:at-west-end-of-twopit-room",
    direction: "down",
    to: "room:in-west-pit",
  });
  // Twopit Room East
  exit(store, {
    from: "room:at-east-end-of-twopit-room",
    direction: "west",
    to: "room:at-west-end-of-twopit-room",
  });
  exit(store, {
    from: "room:at-east-end-of-twopit-room",
    direction: "east",
    to: "room:in-swiss-cheese-room",
  });
  exit(store, {
    from: "room:at-east-end-of-twopit-room",
    direction: "down",
    to: "room:in-east-pit",
  });
  // West Pit
  exit(store, { from: "room:in-west-pit", direction: "up", to: "room:at-west-end-of-twopit-room" });
  // East Pit
  exit(store, { from: "room:in-east-pit", direction: "up", to: "room:at-east-end-of-twopit-room" });
  // Slab Room
  exit(store, {
    from: "room:in-slab-room",
    direction: "south",
    to: "room:at-west-end-of-twopit-room",
  });
  exit(store, { from: "room:in-slab-room", direction: "up", to: "room:in-secret-ns-canyon-0" });
  exit(store, { from: "room:in-slab-room", direction: "north", to: "room:in-bedquilt" });
  // Soft Room
  exit(store, { from: "room:in-soft-room", direction: "west", to: "room:in-swiss-cheese-room" });
  // Oriental Room
  exit(store, { from: "room:in-oriental-room", direction: "west", to: "room:in-large-low-room" });
  exit(store, {
    from: "room:in-oriental-room",
    direction: "southeast",
    to: "room:in-swiss-cheese-room",
  });
  exit(store, { from: "room:in-oriental-room", direction: "up", to: "room:in-misty-cavern" });
  exit(store, { from: "room:in-oriental-room", direction: "north", to: "room:in-misty-cavern" });
  // Misty Cavern
  exit(store, { from: "room:in-misty-cavern", direction: "south", to: "room:in-oriental-room" });
  exit(store, { from: "room:in-misty-cavern", direction: "west", to: "room:in-alcove" });
  // Alcove
  exit(store, { from: "room:in-alcove", direction: "northwest", to: "room:in-misty-cavern" });
  exit(store, { from: "room:in-alcove", direction: "east", to: "room:in-plover-room" });
  // Plover Room
  exit(store, { from: "room:in-plover-room", direction: "west", to: "room:in-alcove" });
  exit(store, { from: "room:in-plover-room", direction: "northeast", to: "room:in-dark-room" });
  // Dark Room
  exit(store, { from: "room:in-dark-room", direction: "south", to: "room:in-plover-room" });
  // Arched Hall / Shell Room corridor
  exit(store, { from: "room:in-arched-hall", direction: "down", to: "room:in-shell-room" });
  exit(store, { from: "room:in-shell-room", direction: "up", to: "room:in-arched-hall" });
  exit(store, { from: "room:in-shell-room", direction: "down", to: "room:in-ragged-corridor" });
  exit(store, { from: "room:in-shell-room", direction: "south", to: "room:at-complex-junction" });
  exit(store, { from: "room:in-ragged-corridor", direction: "up", to: "room:in-shell-room" });
  exit(store, { from: "room:in-ragged-corridor", direction: "down", to: "room:in-a-cul-de-sac" });
  exit(store, { from: "room:in-a-cul-de-sac", direction: "up", to: "room:in-ragged-corridor" });
  // Anteroom / Witt's End
  exit(store, { from: "room:in-anteroom", direction: "up", to: "room:at-complex-junction" });
  exit(store, { from: "room:in-anteroom", direction: "west", to: "room:in-bedquilt" });
  exit(store, { from: "room:in-anteroom", direction: "east", to: "room:at-witts-end" });
  exit(store, { from: "room:at-witts-end", direction: "east", to: "room:in-anteroom" });
  // Large Low Room
  exit(store, { from: "room:in-large-low-room", direction: "south", to: "room:in-bedquilt" });
  exit(store, {
    from: "room:in-large-low-room",
    direction: "southwest",
    to: "room:in-sloping-corridor",
  });
  exit(store, {
    from: "room:in-large-low-room",
    direction: "southeast",
    to: "room:in-oriental-room",
  });
  exit(store, { from: "room:in-large-low-room", direction: "north", to: "room:dead-end-crawl" });
  // Dead End Crawl
  exit(store, { from: "room:dead-end-crawl", direction: "south", to: "room:in-large-low-room" });
}

export function createBedquiltRooms(store: EntityStore): void {
  createRooms(store);
  createExits(store);
}
