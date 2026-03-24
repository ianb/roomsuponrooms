import type { EntityStore } from "../../core/entity.js";
import { abovegroundRoom, exit } from "./room-helpers.js";

export function createOutsideRooms(store: EntityStore): void {
  abovegroundRoom(store, {
    id: "room:at-end-of-road",
    name: "At End Of Road",
    description:
      "You are standing at the end of a road before a small brick building. Around you is a forest. A small stream flows out of the building and down a gully.",
  });
  abovegroundRoom(store, {
    id: "room:at-hill-in-road",
    name: "At Hill In Road",
    description:
      "You have walked up a hill, still in the forest. The road slopes back down the other side of the hill. There is a building in the distance.",
  });
  abovegroundRoom(store, {
    id: "room:inside-building",
    name: "Inside Building",
    description: "You are inside a building, a well house for a large spring.",
  });
  abovegroundRoom(store, {
    id: "room:in-forest-1",
    name: "In Forest",
    description: "You are in open forest, with a deep valley to one side.",
  });
  abovegroundRoom(store, {
    id: "room:in-forest-2",
    name: "In Forest",
    description: "You are in open forest near both a valley and a road.",
  });
  abovegroundRoom(store, {
    id: "room:in-a-valley",
    name: "In A Valley",
    description: "You are in a valley in the forest beside a stream tumbling along a rocky bed.",
  });
  abovegroundRoom(store, {
    id: "room:at-slit-in-streambed",
    name: "At Slit In Streambed",
    description:
      "At your feet all the water of the stream splashes into a 2-inch slit in the rock. Downstream the streambed is bare rock.",
  });
  abovegroundRoom(store, {
    id: "room:outside-grate",
    name: "Outside Grate",
    description:
      "You are in a 20-foot depression floored with bare dirt. Set into the dirt is a strong steel grate mounted in concrete. A dry streambed leads into the depression.",
  });

  // At End Of Road connections
  exit(store, { from: "room:at-end-of-road", direction: "west", to: "room:inside-building" });
  exit(store, { from: "room:at-end-of-road", direction: "south", to: "room:in-a-valley" });
  exit(store, { from: "room:at-end-of-road", direction: "north", to: "room:in-forest-1" });
  exit(store, { from: "room:at-end-of-road", direction: "east", to: "room:at-hill-in-road" });
  exit(store, { from: "room:at-end-of-road", direction: "down", to: "room:in-a-valley" });

  // At Hill In Road
  exit(store, { from: "room:at-hill-in-road", direction: "west", to: "room:at-end-of-road" });
  exit(store, { from: "room:at-hill-in-road", direction: "down", to: "room:at-end-of-road" });
  exit(store, { from: "room:at-hill-in-road", direction: "north", to: "room:at-end-of-road" });
  exit(store, { from: "room:at-hill-in-road", direction: "south", to: "room:in-forest-1" });

  // Inside Building (only exit is west)
  exit(store, { from: "room:inside-building", direction: "east", to: "room:at-end-of-road" });

  // Forest 1 (loops to self in most directions)
  exit(store, { from: "room:in-forest-1", direction: "north", to: "room:in-forest-1" });
  exit(store, { from: "room:in-forest-1", direction: "west", to: "room:in-forest-1" });
  exit(store, { from: "room:in-forest-1", direction: "south", to: "room:in-forest-1" });
  exit(store, { from: "room:in-forest-1", direction: "east", to: "room:in-a-valley" });
  exit(store, { from: "room:in-forest-1", direction: "down", to: "room:in-a-valley" });

  // Forest 2
  exit(store, { from: "room:in-forest-2", direction: "north", to: "room:at-end-of-road" });
  exit(store, { from: "room:in-forest-2", direction: "east", to: "room:in-a-valley" });
  exit(store, { from: "room:in-forest-2", direction: "west", to: "room:in-a-valley" });
  exit(store, { from: "room:in-forest-2", direction: "south", to: "room:in-forest-1" });

  // In A Valley
  exit(store, { from: "room:in-a-valley", direction: "north", to: "room:at-end-of-road" });
  exit(store, { from: "room:in-a-valley", direction: "east", to: "room:in-forest-1" });
  exit(store, { from: "room:in-a-valley", direction: "west", to: "room:in-forest-1" });
  exit(store, { from: "room:in-a-valley", direction: "up", to: "room:in-forest-1" });
  exit(store, { from: "room:in-a-valley", direction: "south", to: "room:at-slit-in-streambed" });
  exit(store, { from: "room:in-a-valley", direction: "down", to: "room:at-slit-in-streambed" });

  // At Slit In Streambed
  exit(store, { from: "room:at-slit-in-streambed", direction: "north", to: "room:in-a-valley" });
  exit(store, { from: "room:at-slit-in-streambed", direction: "east", to: "room:in-forest-1" });
  exit(store, { from: "room:at-slit-in-streambed", direction: "west", to: "room:in-forest-1" });
  exit(store, {
    from: "room:at-slit-in-streambed",
    direction: "south",
    to: "room:outside-grate",
  });

  // Outside Grate (down through grate is a door - skip)
  exit(store, {
    from: "room:outside-grate",
    direction: "north",
    to: "room:at-slit-in-streambed",
  });
  exit(store, { from: "room:outside-grate", direction: "east", to: "room:in-forest-1" });
  exit(store, { from: "room:outside-grate", direction: "west", to: "room:in-forest-1" });
  exit(store, { from: "room:outside-grate", direction: "south", to: "room:in-forest-1" });
}
