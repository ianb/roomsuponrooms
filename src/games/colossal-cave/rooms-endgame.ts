import type { EntityStore } from "../../core/entity.js";
import { undergroundRoom, exit } from "./room-helpers.js";

function createRooms(store: EntityStore): void {
  undergroundRoom(store, {
    id: "room:at-ne-end",
    name: "NE End of Repository",
    description:
      "You are at the northeast end of an immense room, even larger than the giant room. It appears to be a repository for the 'Adventure' program. Massive torches far overhead bathe the room with smoky yellow light. Scattered about you can be seen a pile of bottles (all of them empty), a nursery of young beanstalks murmuring quietly, a bed of oysters, a bundle of black rods with rusty stars on their ends, and a collection of brass lanterns. Off to one side a great many dwarves are sleeping on the floor, snoring loudly. A sign nearby reads: 'Do not disturb the dwarves!'",
    tags: ["safe"],
    lit: true,
  });
  undergroundRoom(store, {
    id: "room:at-sw-end",
    name: "SW End of Repository",
    description:
      "You are at the southwest end of the repository. To one side is a pit full of fierce green snakes. On the other side is a row of small wicker cages, each of which contains a little sulking bird. In one corner is a bundle of black rods with rusty marks on their ends. A large number of velvet pillows are scattered about on the floor. A vast mirror stretches off to the northeast. At your feet is a large steel grate, next to which is a sign which reads, 'TREASURE VAULT. Keys in main office.'",
    tags: ["safe"],
    lit: true,
  });
}

function createExits(store: EntityStore): void {
  exit(store, { from: "room:at-ne-end", direction: "southwest", to: "room:at-sw-end" });
  exit(store, { from: "room:at-sw-end", direction: "northeast", to: "room:at-ne-end" });
}

export function createEndgameRooms(store: EntityStore): void {
  createRooms(store);
  createExits(store);
}
