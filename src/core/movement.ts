import type { EntityStore, Entity } from "./entity.js";
import type { WorldEvent } from "./verb-types.js";
import { describeRoomFull } from "./describe.js";
import { isRoomLit, darknessDescription } from "./darkness.js";

export interface UnresolvedExitContext {
  exit: Entity;
  room: Entity;
  player: Entity;
  direction: string;
}

const DIRECTION_ALIASES: Record<string, string> = {
  n: "north",
  s: "south",
  e: "east",
  w: "west",
  ne: "northeast",
  nw: "northwest",
  se: "southeast",
  sw: "southwest",
  u: "up",
  d: "down",
};

export interface MovementResult {
  output: string;
  direction: string;
  moved: boolean;
  events: WorldEvent[];
  unresolvedExit?: UnresolvedExitContext;
}

function exitDirection(e: Entity): string {
  return (e.exit && e.exit.direction) || "";
}

export function tryMovement(store: EntityStore, input: string): MovementResult | null {
  const trimmed = input.trim().toLowerCase();
  let direction: string;
  let isExplicitGo = false;

  if (trimmed.startsWith("go ")) {
    const raw = trimmed.slice(3).trim();
    direction = DIRECTION_ALIASES[raw] || raw;
    isExplicitGo = true;
  } else {
    const expanded = DIRECTION_ALIASES[trimmed];
    if (expanded) {
      direction = expanded;
      isExplicitGo = true;
    } else {
      const room = getPlayerRoom(store);
      const exits = store.getExits(room.id);
      const directMatch = exits.find((ex) => exitDirection(ex) === trimmed);
      if (!directMatch) return null;
      direction = trimmed;
    }
  }

  const room = getPlayerRoom(store);
  const exits = store.getExits(room.id);
  const exit = exits.find((e) => exitDirection(e) === direction);

  if (exit) {
    if (exit.properties.locked) {
      const exitName = exit.name !== exit.id ? exit.name : "way";
      return { output: `{!The ${exitName} is locked.!}`, direction, moved: false, events: [] };
    }
    // Unresolved exit — has intent but no destination yet
    if (exit.exit && exit.exit.destinationIntent && !exit.exit.destination) {
      const exitName = exit.name !== exit.id ? exit.name : `the way ${direction}`;
      return {
        output: `{!${exitName} leads somewhere, but the way is not yet clear.!}`,
        direction,
        moved: false,
        events: [],
        unresolvedExit: { exit, room, player: getPlayer(store), direction },
      };
    }
    const events: WorldEvent[] = [];
    if (exit.tags.includes("openable") && !exit.properties.open) {
      events.push({
        type: "set-property",
        entityId: exit.id,
        property: "open",
        value: true,
        description: "Auto-opened door",
      });
      const pairedId = exit.properties.pairedDoor;
      if (pairedId && store.has(pairedId)) {
        events.push({
          type: "set-property",
          entityId: pairedId,
          property: "open",
          value: true,
          description: "Auto-opened paired door",
        });
      }
    }
    const destination = (exit.exit && exit.exit.destination) || "";
    const player = getPlayer(store);
    events.push({
      type: "set-property",
      entityId: player.id,
      property: "location",
      value: destination,
      oldValue: player.location,
      description: "",
    });
    for (const event of events) {
      if (event.property === "location") {
        store.setLocation(event.entityId, event.value as string);
      } else if (event.property) {
        store.setProperty(event.entityId, { name: event.property, value: event.value });
      }
    }
    const newRoom = store.get(destination);
    const lit = isRoomLit(store, { room: newRoom, playerId: player.id });
    const output = lit
      ? describeRoomFull(store, { room: newRoom, playerId: player.id })
      : darknessDescription();
    return { output, direction, moved: true, events };
  }

  if (isExplicitGo) {
    const exitDirs = exits.map((e) => exitDirection(e));
    return {
      output: `{!You can't go ${direction}. Available exits: ${exitDirs.join(", ")}!}`,
      direction,
      moved: false,
      events: [],
    };
  }

  return null;
}

export function getPlayer(store: EntityStore): Entity {
  const players = store.findByTag("player");
  const player = players[0];
  if (!player) {
    throw new PlayerNotFoundError();
  }
  return player;
}

export function getPlayerRoom(store: EntityStore): Entity {
  const player = getPlayer(store);
  return store.get(player.location);
}

class PlayerNotFoundError extends Error {
  constructor() {
    super("No player entity found");
    this.name = "PlayerNotFoundError";
  }
}
