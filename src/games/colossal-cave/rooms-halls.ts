import type { EntityStore } from "../../core/entity.js";
import { undergroundRoom, exit } from "./room-helpers.js";

function createRooms(store: EntityStore): void {
  undergroundRoom(store, {
    id: "room:in-hall-of-mists",
    name: "In Hall of Mists",
    description:
      "You are at one end of a vast hall stretching forward out of sight to the west. There are openings to either side. Nearby, a wide stone staircase leads downward. The hall is filled with wisps of white mist swaying to and fro almost as if alive. A cold wind blows up the staircase. There is a passage at the top of a dome behind you.\n\nRough stone steps lead up the dome.",
  });
  undergroundRoom(store, {
    id: "room:in-nugget-of-gold-room",
    name: "Low Room",
    description:
      "This is a low room with a crude note on the wall:\n\n'You won't get it up the steps'.",
  });
  undergroundRoom(store, {
    id: "room:on-east-bank-of-fissure",
    name: "On East Bank of Fissure",
    description:
      "You are on the east bank of a fissure slicing clear across the hall. The mist is quite thick here, and the fissure is too wide to jump.",
  });
  undergroundRoom(store, {
    id: "room:west-side-of-fissure",
    name: "West Side of Fissure",
    description: "You are on the west side of the fissure in the hall of mists.",
  });
  undergroundRoom(store, {
    id: "room:at-west-end-of-hall-of-mists",
    name: "At West End of Hall of Mists",
    description:
      "You are at the west end of the hall of mists. A low wide crawl continues west and another goes north. To the south is a little passage 6 feet off the floor.",
  });
  undergroundRoom(store, {
    id: "room:at-east-end-of-long-hall",
    name: "At East End of Long Hall",
    description:
      "You are at the east end of a very long hall apparently without side chambers. To the east a low wide crawl slants up. To the north a round two foot hole slants down.",
  });
  undergroundRoom(store, {
    id: "room:at-west-end-of-long-hall",
    name: "At West End of Long Hall",
    description:
      "You are at the west end of a very long featureless hall. The hall joins up with a narrow north/south passage.",
  });
  undergroundRoom(store, {
    id: "room:crossover",
    name: "N/S and E/W Crossover",
    description: "You are at a crossover of a high N/S passage and a low E/W one.",
  });
  undergroundRoom(store, {
    id: "room:dead-end-7",
    name: "Dead End",
    description: "You have reached a dead end.",
  });
  undergroundRoom(store, {
    id: "room:in-hall-of-mt-king",
    name: "Hall of the Mountain King",
    description: "You are in the hall of the mountain king, with passages off in all directions.",
  });
  undergroundRoom(store, {
    id: "room:low-ns-passage",
    name: "Low N/S Passage",
    description:
      "You are in a low N/S passage at a hole in the floor. The hole goes down to an E/W passage.",
  });
  undergroundRoom(store, {
    id: "room:in-south-side-chamber",
    name: "In South Side Chamber",
    description: "You are in the south side chamber.",
  });
  undergroundRoom(store, {
    id: "room:in-west-side-chamber",
    name: "In West Side Chamber",
    description:
      "You are in the west side chamber of the hall of the mountain king. A passage continues west and up here.",
  });
  undergroundRoom(store, {
    id: "room:at-y2",
    name: "At 'Y2'",
    description:
      "You are in a large room, with a passage to the south, a passage to the west, and a wall of broken rock to the east. There is a large 'Y2' on a rock in the room's center.",
  });
  undergroundRoom(store, {
    id: "room:jumble-of-rock",
    name: "Jumble of Rock",
    description: "You are in a jumble of rock, with cracks everywhere.",
  });
  undergroundRoom(store, {
    id: "room:at-window-on-pit-1",
    name: "At Window on Pit",
    description:
      "You're at a low window overlooking a huge pit, which extends up out of sight. A floor is indistinctly visible over 50 feet below. Traces of white mist cover the floor of the pit, becoming thicker to the right. Marks in the dust around the window would seem to indicate that someone has been here recently. Directly across the pit from you and 25 feet away there is a similar window looking into a lighted room. A shadowy figure can be seen there peering back at you.",
  });
}

function createExits(store: EntityStore): void {
  // Hall of Mists
  exit(store, { from: "room:in-hall-of-mists", direction: "up", to: "room:at-top-of-small-pit" });
  exit(store, {
    from: "room:in-hall-of-mists",
    direction: "south",
    to: "room:in-nugget-of-gold-room",
  });
  exit(store, {
    from: "room:in-hall-of-mists",
    direction: "west",
    to: "room:on-east-bank-of-fissure",
  });
  exit(store, {
    from: "room:in-hall-of-mists",
    direction: "down",
    to: "room:in-hall-of-mt-king",
  });
  exit(store, {
    from: "room:in-hall-of-mists",
    direction: "north",
    to: "room:in-hall-of-mt-king",
  });

  // Nugget Room
  exit(store, {
    from: "room:in-nugget-of-gold-room",
    direction: "north",
    to: "room:in-hall-of-mists",
  });

  // East Bank of Fissure (fissure crossing is a door - skip)
  exit(store, {
    from: "room:on-east-bank-of-fissure",
    direction: "east",
    to: "room:in-hall-of-mists",
  });

  // West Side of Fissure (fissure crossing is a door - skip)
  exit(store, {
    from: "room:west-side-of-fissure",
    direction: "west",
    to: "room:at-west-end-of-hall-of-mists",
  });
  exit(store, {
    from: "room:west-side-of-fissure",
    direction: "north",
    to: "room:at-west-end-of-hall-of-mists",
  });

  // West End of Hall of Mists
  exit(store, {
    from: "room:at-west-end-of-hall-of-mists",
    direction: "south",
    to: "room:alike-maze-1",
  });
  exit(store, {
    from: "room:at-west-end-of-hall-of-mists",
    direction: "up",
    to: "room:alike-maze-1",
  });
  exit(store, {
    from: "room:at-west-end-of-hall-of-mists",
    direction: "west",
    to: "room:at-east-end-of-long-hall",
  });
  exit(store, {
    from: "room:at-west-end-of-hall-of-mists",
    direction: "north",
    to: "room:west-side-of-fissure",
  });

  // East End of Long Hall
  exit(store, {
    from: "room:at-east-end-of-long-hall",
    direction: "up",
    to: "room:at-west-end-of-hall-of-mists",
  });
  exit(store, {
    from: "room:at-east-end-of-long-hall",
    direction: "west",
    to: "room:at-west-end-of-long-hall",
  });
  exit(store, {
    from: "room:at-east-end-of-long-hall",
    direction: "north",
    to: "room:crossover",
  });
  exit(store, {
    from: "room:at-east-end-of-long-hall",
    direction: "down",
    to: "room:crossover",
  });

  // West End of Long Hall
  exit(store, {
    from: "room:at-west-end-of-long-hall",
    direction: "east",
    to: "room:at-east-end-of-long-hall",
  });
  exit(store, {
    from: "room:at-west-end-of-long-hall",
    direction: "south",
    to: "room:different-maze-1",
  });
  exit(store, {
    from: "room:at-west-end-of-long-hall",
    direction: "north",
    to: "room:crossover",
  });

  // Crossover
  exit(store, { from: "room:crossover", direction: "north", to: "room:dead-end-7" });
  exit(store, { from: "room:crossover", direction: "east", to: "room:in-west-side-chamber" });
  exit(store, {
    from: "room:crossover",
    direction: "west",
    to: "room:at-east-end-of-long-hall",
  });
  exit(store, {
    from: "room:crossover",
    direction: "south",
    to: "room:at-east-end-of-long-hall",
  });
  exit(store, { from: "room:dead-end-7", direction: "south", to: "room:crossover" });

  // Hall of Mt King
  exit(store, { from: "room:in-hall-of-mt-king", direction: "east", to: "room:in-hall-of-mists" });
  exit(store, { from: "room:in-hall-of-mt-king", direction: "north", to: "room:low-ns-passage" });
  exit(store, {
    from: "room:in-hall-of-mt-king",
    direction: "south",
    to: "room:in-south-side-chamber",
  });
  exit(store, {
    from: "room:in-hall-of-mt-king",
    direction: "west",
    to: "room:in-west-side-chamber",
  });
  exit(store, {
    from: "room:in-hall-of-mt-king",
    direction: "southwest",
    to: "room:in-secret-ew-canyon",
  });
  exit(store, { from: "room:low-ns-passage", direction: "south", to: "room:in-hall-of-mt-king" });
  exit(store, { from: "room:low-ns-passage", direction: "down", to: "room:in-dirty-passage" });
  exit(store, { from: "room:low-ns-passage", direction: "north", to: "room:at-y2" });
  exit(store, {
    from: "room:in-south-side-chamber",
    direction: "north",
    to: "room:in-hall-of-mt-king",
  });
  exit(store, {
    from: "room:in-west-side-chamber",
    direction: "east",
    to: "room:in-hall-of-mt-king",
  });
  exit(store, { from: "room:in-west-side-chamber", direction: "west", to: "room:crossover" });
  exit(store, { from: "room:in-west-side-chamber", direction: "up", to: "room:crossover" });

  // Y2 area
  exit(store, { from: "room:at-y2", direction: "south", to: "room:low-ns-passage" });
  exit(store, { from: "room:at-y2", direction: "east", to: "room:jumble-of-rock" });
  exit(store, { from: "room:at-y2", direction: "west", to: "room:at-window-on-pit-1" });
  exit(store, { from: "room:jumble-of-rock", direction: "down", to: "room:at-y2" });
  exit(store, { from: "room:jumble-of-rock", direction: "up", to: "room:in-hall-of-mists" });
  exit(store, { from: "room:at-window-on-pit-1", direction: "east", to: "room:at-y2" });
}

export function createHallsRooms(store: EntityStore): void {
  createRooms(store);
  createExits(store);
}
