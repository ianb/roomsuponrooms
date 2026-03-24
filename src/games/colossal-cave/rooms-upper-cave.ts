import type { EntityStore } from "../../core/entity.js";
import { undergroundRoom, exit } from "./room-helpers.js";

function createRooms(store: EntityStore): void {
  undergroundRoom(store, {
    id: "room:below-the-grate",
    name: "Below The Grate",
    description:
      "You are in a small chamber beneath a 3x3 steel grate to the surface. A low crawl over cobbles leads inward to the west.",
    tags: ["safe", "lighted"],
  });
  undergroundRoom(store, {
    id: "room:in-cobble-crawl",
    name: "In Cobble Crawl",
    description:
      "You are crawling over cobbles in a low passage. There is a dim light at the east end of the passage.",
    tags: ["safe", "lighted"],
  });
  undergroundRoom(store, {
    id: "room:in-debris-room",
    name: "In Debris Room",
    description:
      "You are in a debris room filled with stuff washed in from the surface. A low wide passage with cobbles becomes plugged with mud and debris here, but an awkward canyon leads upward and west.\n\nA note on the wall says, 'Magic word XYZZY.'",
    tags: ["safe"],
  });
  undergroundRoom(store, {
    id: "room:in-awkward-sloping-ew-canyon",
    name: "Sloping E/W Canyon",
    description: "You are in an awkward sloping east/west canyon.",
    tags: ["safe"],
  });
  undergroundRoom(store, {
    id: "room:in-bird-chamber",
    name: "Orange River Chamber",
    description:
      "You are in a splendid chamber thirty feet high. The walls are frozen rivers of orange stone. An awkward canyon and a good passage exit from east and west sides of the chamber.",
    tags: ["safe"],
  });
  undergroundRoom(store, {
    id: "room:at-top-of-small-pit",
    name: "At Top of Small Pit",
    description:
      "At your feet is a small pit breathing traces of white mist. A west passage ends here except for a small crack leading on.\n\nRough stone steps lead down the pit.",
    tags: ["safe"],
  });
  undergroundRoom(store, {
    id: "room:in-dirty-passage",
    name: "Dirty Passage",
    description:
      "You are in a dirty broken passage. To the east is a crawl. To the west is a large passage. Above you is a hole to another passage.",
  });
  undergroundRoom(store, {
    id: "room:on-brink-of-pit",
    name: "Brink of Pit",
    description: "You are on the brink of a small clean climbable pit. A crawl leads west.",
  });
  undergroundRoom(store, {
    id: "room:in-pit",
    name: "In Pit",
    description:
      "You are in the bottom of a small pit with a little stream, which enters and exits through tiny slits.",
    tags: ["safe"],
  });
  undergroundRoom(store, {
    id: "room:in-dusty-rock-room",
    name: "In Dusty Rock Room",
    description:
      "You are in a large room full of dusty rocks. There is a big hole in the floor. There are cracks everywhere, and a passage leading east.",
  });
}

function createExits(store: EntityStore): void {
  exit(store, { from: "room:below-the-grate", direction: "west", to: "room:in-cobble-crawl" });
  exit(store, { from: "room:in-cobble-crawl", direction: "east", to: "room:below-the-grate" });
  exit(store, { from: "room:in-cobble-crawl", direction: "west", to: "room:in-debris-room" });
  exit(store, { from: "room:in-debris-room", direction: "east", to: "room:in-cobble-crawl" });
  exit(store, {
    from: "room:in-debris-room",
    direction: "up",
    to: "room:in-awkward-sloping-ew-canyon",
  });
  exit(store, {
    from: "room:in-debris-room",
    direction: "west",
    to: "room:in-awkward-sloping-ew-canyon",
  });
  exit(store, {
    from: "room:in-awkward-sloping-ew-canyon",
    direction: "east",
    to: "room:in-debris-room",
  });
  exit(store, {
    from: "room:in-awkward-sloping-ew-canyon",
    direction: "down",
    to: "room:in-debris-room",
  });
  exit(store, {
    from: "room:in-awkward-sloping-ew-canyon",
    direction: "up",
    to: "room:in-bird-chamber",
  });
  exit(store, {
    from: "room:in-awkward-sloping-ew-canyon",
    direction: "west",
    to: "room:in-bird-chamber",
  });
  exit(store, {
    from: "room:in-bird-chamber",
    direction: "east",
    to: "room:in-awkward-sloping-ew-canyon",
  });
  exit(store, {
    from: "room:in-bird-chamber",
    direction: "west",
    to: "room:at-top-of-small-pit",
  });
  exit(store, {
    from: "room:at-top-of-small-pit",
    direction: "east",
    to: "room:in-bird-chamber",
  });
  exit(store, {
    from: "room:at-top-of-small-pit",
    direction: "down",
    to: "room:in-hall-of-mists",
  });
  exit(store, { from: "room:in-dirty-passage", direction: "east", to: "room:on-brink-of-pit" });
  exit(store, { from: "room:in-dirty-passage", direction: "up", to: "room:low-ns-passage" });
  exit(store, { from: "room:in-dirty-passage", direction: "west", to: "room:in-dusty-rock-room" });
  exit(store, { from: "room:on-brink-of-pit", direction: "west", to: "room:in-dirty-passage" });
  exit(store, { from: "room:on-brink-of-pit", direction: "down", to: "room:in-pit" });
  exit(store, { from: "room:in-pit", direction: "up", to: "room:on-brink-of-pit" });
  exit(store, { from: "room:in-dusty-rock-room", direction: "east", to: "room:in-dirty-passage" });
  exit(store, {
    from: "room:in-dusty-rock-room",
    direction: "down",
    to: "room:at-complex-junction",
  });
}

export function createUpperCaveRooms(store: EntityStore): void {
  createRooms(store);
  createExits(store);
}
