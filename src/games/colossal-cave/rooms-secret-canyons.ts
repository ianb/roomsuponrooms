import type { EntityStore } from "../../core/entity.js";
import { undergroundRoom, exit } from "./room-helpers.js";

function createRooms(store: EntityStore): void {
  undergroundRoom(store, {
    id: "room:in-secret-ns-canyon-0",
    name: "Secret N/S Canyon",
    description: "You are in a secret N/S canyon above a large room.",
  });
  undergroundRoom(store, {
    id: "room:in-secret-ns-canyon-1",
    name: "Secret N/S Canyon",
    description: "You are in a secret N/S canyon above a sizable passage.",
  });
  undergroundRoom(store, {
    id: "room:at-junction-of-three",
    name: "Junction of Three Secret Canyons",
    description:
      "You are in a secret canyon at a junction of three canyons, bearing north, south, and se. The north one is as tall as the other two combined.",
  });
  undergroundRoom(store, {
    id: "room:in-secret-ew-canyon",
    name: "Secret E/W Canyon Above Tight Canyon",
    description:
      "You are in a secret canyon which here runs E/W. It crosses over a very tight canyon 15 feet below. If you go down you may not be able to get back up.",
  });
  undergroundRoom(store, {
    id: "room:in-ns-canyon",
    name: "N/S Canyon",
    description: "You are at a wide place in a very tight N/S canyon.",
  });
  undergroundRoom(store, {
    id: "room:canyon-dead-end",
    name: "Canyon Dead End",
    description: "The canyon here becomes too tight to go further south.",
  });
  undergroundRoom(store, {
    id: "room:in-tall-ew-canyon",
    name: "In Tall E/W Canyon",
    description:
      "You are in a tall E/W canyon. A low tight crawl goes 3 feet north and seems to open up.",
  });
  undergroundRoom(store, {
    id: "room:atop-stalactite",
    name: "Atop Stalactite",
    description:
      "A large stalactite extends from the roof and almost reaches the floor below. You could climb down it, and jump from it to the floor, but having done so you would be unable to reach it to climb back up.",
  });
  undergroundRoom(store, {
    id: "room:in-secret-canyon",
    name: "Secret Canyon",
    description: "You are in a secret canyon which exits to the north and east.",
  });
  undergroundRoom(store, {
    id: "room:in-mirror-canyon",
    name: "In Mirror Canyon",
    description:
      "You are in a north/south canyon about 25 feet across. The floor is covered by white mist seeping in from the north. The walls extend upward for well over 100 feet. Suspended from some unseen point far above you, an enormous two-sided mirror is hanging parallel to and midway between the canyon walls.\n\nA small window can be seen in either wall, some fifty feet up.",
  });
  undergroundRoom(store, {
    id: "room:at-window-on-pit-2",
    name: "At Window on Pit",
    description:
      "You're at a low window overlooking a huge pit, which extends up out of sight. A floor is indistinctly visible over 50 feet below. Traces of white mist cover the floor of the pit, becoming thicker to the left. Marks in the dust around the window would seem to indicate that someone has been here recently. Directly across the pit from you and 25 feet away there is a similar window looking into a lighted room. A shadowy figure can be seen there peering back at you.",
  });
  undergroundRoom(store, {
    id: "room:at-reservoir",
    name: "At Reservoir",
    description:
      "You are at the edge of a large underground reservoir. An opaque cloud of white mist fills the room and rises rapidly upward. The lake is fed by a stream, which tumbles out of a hole in the wall about 10 feet overhead and splashes noisily into the water somewhere within the mist. The only passage goes back toward the south.",
    tags: ["safe"],
  });
}

function createExits(store: EntityStore): void {
  // Secret N/S Canyon 0
  exit(store, { from: "room:in-secret-ns-canyon-0", direction: "down", to: "room:in-slab-room" });
  exit(store, {
    from: "room:in-secret-ns-canyon-0",
    direction: "south",
    to: "room:in-secret-canyon",
  });
  exit(store, {
    from: "room:in-secret-ns-canyon-0",
    direction: "north",
    to: "room:in-mirror-canyon",
  });
  // Secret N/S Canyon 1
  exit(store, {
    from: "room:in-secret-ns-canyon-1",
    direction: "north",
    to: "room:at-junction-of-three",
  });
  exit(store, { from: "room:in-secret-ns-canyon-1", direction: "down", to: "room:in-bedquilt" });
  exit(store, {
    from: "room:in-secret-ns-canyon-1",
    direction: "south",
    to: "room:atop-stalactite",
  });
  // Junction of Three
  exit(store, {
    from: "room:at-junction-of-three",
    direction: "southeast",
    to: "room:in-bedquilt",
  });
  exit(store, {
    from: "room:at-junction-of-three",
    direction: "south",
    to: "room:in-secret-ns-canyon-1",
  });
  exit(store, {
    from: "room:at-junction-of-three",
    direction: "north",
    to: "room:at-window-on-pit-2",
  });
  // Secret E/W Canyon
  exit(store, {
    from: "room:in-secret-ew-canyon",
    direction: "east",
    to: "room:in-hall-of-mt-king",
  });
  exit(store, {
    from: "room:in-secret-ew-canyon",
    direction: "west",
    to: "room:in-secret-canyon",
  });
  exit(store, { from: "room:in-secret-ew-canyon", direction: "down", to: "room:in-ns-canyon" });
  // N/S Canyon
  exit(store, { from: "room:in-ns-canyon", direction: "south", to: "room:canyon-dead-end" });
  exit(store, { from: "room:in-ns-canyon", direction: "north", to: "room:in-tall-ew-canyon" });
  // Canyon Dead End
  exit(store, { from: "room:canyon-dead-end", direction: "north", to: "room:in-ns-canyon" });
  // Tall E/W Canyon
  exit(store, { from: "room:in-tall-ew-canyon", direction: "east", to: "room:in-ns-canyon" });
  exit(store, { from: "room:in-tall-ew-canyon", direction: "west", to: "room:dead-end-8" });
  exit(store, {
    from: "room:in-tall-ew-canyon",
    direction: "north",
    to: "room:in-swiss-cheese-room",
  });
  // Atop Stalactite (down goes to maze - main route to alike-maze-4)
  exit(store, {
    from: "room:atop-stalactite",
    direction: "north",
    to: "room:in-secret-ns-canyon-1",
  });
  exit(store, { from: "room:atop-stalactite", direction: "down", to: "room:alike-maze-4" });
  // Secret Canyon
  exit(store, {
    from: "room:in-secret-canyon",
    direction: "east",
    to: "room:in-secret-ew-canyon",
  });
  exit(store, {
    from: "room:in-secret-canyon",
    direction: "north",
    to: "room:in-secret-ns-canyon-0",
  });
  // Mirror Canyon
  exit(store, { from: "room:in-mirror-canyon", direction: "north", to: "room:at-reservoir" });
  exit(store, {
    from: "room:in-mirror-canyon",
    direction: "south",
    to: "room:in-secret-ns-canyon-0",
  });
  // Window on Pit 2
  exit(store, {
    from: "room:at-window-on-pit-2",
    direction: "west",
    to: "room:at-junction-of-three",
  });
  // Reservoir
  exit(store, { from: "room:at-reservoir", direction: "south", to: "room:in-mirror-canyon" });
}

export function createSecretCanyonRooms(store: EntityStore): void {
  createRooms(store);
  createExits(store);
}
