import type { EntityStore } from "../../core/entity.js";
import { undergroundRoom, exit } from "./room-helpers.js";

function createRooms(store: EntityStore): void {
  undergroundRoom(store, {
    id: "room:in-narrow-corridor",
    name: "In Narrow Corridor",
    description:
      "You are in a long, narrow corridor stretching out of sight to the west. At the eastern end is a hole through which you can see a profusion of leaves.",
  });
  undergroundRoom(store, {
    id: "room:at-steep-incline",
    name: "Steep Incline Above Large Room",
    description:
      "You are at the top of a steep incline above a large room. You could climb down here, but you would not be able to climb up. There is a passage leading back to the north.",
  });
  undergroundRoom(store, {
    id: "room:in-giant-room",
    name: "Giant Room",
    description:
      "You are in the giant room. The ceiling here is too high up for your lamp to show it. Cavernous passages lead east, north, and south. On the west wall is scrawled the inscription, 'Fee fie foe foo' (sic).",
  });
  undergroundRoom(store, {
    id: "room:at-recent-cave-in",
    name: "Recent Cave-in",
    description: "The passage here is blocked by a recent cave-in.",
  });
  undergroundRoom(store, {
    id: "room:in-immense-ns-passage",
    name: "Immense N/S Passage",
    description: "You are at one end of an immense north/south passage.",
  });
  undergroundRoom(store, {
    id: "room:in-cavern-with-waterfall",
    name: "In Cavern With Waterfall",
    description:
      "You are in a magnificent cavern with a rushing stream, which cascades over a sparkling waterfall into a roaring whirlpool which disappears through a hole in the floor. Passages exit to the south and west.",
  });
  undergroundRoom(store, {
    id: "room:in-sloping-corridor",
    name: "Sloping Corridor",
    description: "You are in a long winding corridor sloping out of sight in both directions.",
  });
}

function createExits(store: EntityStore): void {
  // Narrow Corridor
  exit(store, { from: "room:in-narrow-corridor", direction: "down", to: "room:in-west-pit" });
  exit(store, { from: "room:in-narrow-corridor", direction: "east", to: "room:in-west-pit" });
  exit(store, { from: "room:in-narrow-corridor", direction: "west", to: "room:in-giant-room" });
  // Steep Incline (one-way down to Large Low Room)
  exit(store, {
    from: "room:at-steep-incline",
    direction: "north",
    to: "room:in-cavern-with-waterfall",
  });
  exit(store, { from: "room:at-steep-incline", direction: "down", to: "room:in-large-low-room" });
  // Giant Room
  exit(store, { from: "room:in-giant-room", direction: "south", to: "room:in-narrow-corridor" });
  exit(store, { from: "room:in-giant-room", direction: "east", to: "room:at-recent-cave-in" });
  exit(store, {
    from: "room:in-giant-room",
    direction: "north",
    to: "room:in-immense-ns-passage",
  });
  // Recent Cave-in
  exit(store, { from: "room:at-recent-cave-in", direction: "west", to: "room:in-giant-room" });
  // Immense N/S Passage (north through rusty door - skip door)
  exit(store, {
    from: "room:in-immense-ns-passage",
    direction: "south",
    to: "room:in-giant-room",
  });
  // Cavern With Waterfall
  exit(store, {
    from: "room:in-cavern-with-waterfall",
    direction: "west",
    to: "room:at-steep-incline",
  });
  exit(store, {
    from: "room:in-cavern-with-waterfall",
    direction: "south",
    to: "room:in-immense-ns-passage",
  });
  // Sloping Corridor
  exit(store, {
    from: "room:in-sloping-corridor",
    direction: "down",
    to: "room:in-large-low-room",
  });
  exit(store, {
    from: "room:in-sloping-corridor",
    direction: "up",
    to: "room:on-sw-side-of-chasm",
  });
}

export function createGiantAreaRooms(store: EntityStore): void {
  createRooms(store);
  createExits(store);
}
