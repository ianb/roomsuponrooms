import type { EntityStore, Entity } from "./entity.js";
import type { VerbContext, VerbRegistry, ResolvedCommand } from "./verbs.js";
import { parseCommand, resolveCommand } from "./verbs.js";
import { SYSTEM_VERBS } from "./verb-types.js";
import { describeRoomFull } from "./describe.js";
import { isRoomLit, darknessDescription } from "./darkness.js";

export interface DebugInfo {
  /** e.g. "look", "take lantern", "put key in chest" */
  parse: string;
  outcome: string;
  handler?: string;
  source?: string;
  events?: DebugEvent[];
  vetoedBy?: string;
}

export interface DebugEvent {
  description: string;
  entityId: string;
  property?: string;
  value?: unknown;
}

export interface CommandResult {
  output: string;
  debug?: DebugInfo;
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

class PlayerNotFoundError extends Error {
  constructor() {
    super("No player entity found");
    this.name = "PlayerNotFoundError";
  }
}

function getPlayer(store: EntityStore): Entity {
  const players = store.findByTag("player");
  const player = players[0];
  if (!player) {
    throw new PlayerNotFoundError();
  }
  return player;
}

function getPlayerRoom(store: EntityStore): Entity {
  const player = getPlayer(store);
  const roomId = player.properties["location"] as string;
  return store.get(roomId);
}

interface MovementResult {
  output: string;
  direction: string;
  moved: boolean;
}

function tryMovement(store: EntityStore, input: string): MovementResult | null {
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
    } else {
      // Check if the input is already a full direction name
      const room = getPlayerRoom(store);
      const exits = store.getExits(room.id);
      const directMatch = exits.find((ex) => ex.properties["direction"] === trimmed);
      if (!directMatch) return null;
      direction = trimmed;
    }
  }

  const room = getPlayerRoom(store);
  const exits = store.getExits(room.id);
  const exit = exits.find((e) => e.properties["direction"] === direction);

  if (exit) {
    if (exit.properties["locked"] === true) {
      const exitName = (exit.properties["name"] as string) || "way";
      return { output: `The ${exitName} is locked.`, direction, moved: false };
    }
    // Auto-open unlocked doors
    if (exit.tags.has("openable") && exit.properties["open"] !== true) {
      store.setProperty(exit.id, { name: "open", value: true });
      // If there's a paired door, open it too
      const pairedId = exit.properties["pairedDoor"] as string | undefined;
      if (pairedId && store.has(pairedId)) {
        store.setProperty(pairedId, { name: "open", value: true });
      }
    }
    const destination = exit.properties["destination"] as string;
    const player = getPlayer(store);
    store.setProperty(player.id, { name: "location", value: destination });
    const newRoom = store.get(destination);
    const lit = isRoomLit(store, { room: newRoom, playerId: player.id });
    const output = lit
      ? describeRoomFull(store, { room: newRoom, playerId: player.id })
      : darknessDescription();
    return { output, direction, moved: true };
  }

  if (isExplicitGo) {
    const exitDirs = exits.map((e) => e.properties["direction"] as string);
    return {
      output: `You can't go ${direction}. Available exits: ${exitDirs.join(", ")}`,
      direction,
      moved: false,
    };
  }

  return null;
}

function dispatchSystemVerbs(
  verbs: VerbRegistry,
  { store, player, systemVerbs }: { store: EntityStore; player: Entity; systemVerbs: string[] },
): string[] {
  const allOutputs: string[] = [];
  for (const verb of systemVerbs) {
    // Re-read room in case a prior system verb changed location
    const currentRoom = getPlayerRoom(store);
    const context: VerbContext = {
      store,
      command: { form: "intransitive", verb },
      player,
      room: currentRoom,
    };
    const outputs = verbs.dispatchSystem(verb, context);
    allOutputs.push(...outputs);
  }
  return allOutputs;
}

export function processCommand(
  store: EntityStore,
  { input, verbs, debug }: { input: string; verbs: VerbRegistry; debug?: boolean },
): CommandResult {
  const player = getPlayer(store);

  // Try movement first (direction aliases + "go X")
  const movement = tryMovement(store, input);
  if (movement) {
    const parts = [movement.output];
    if (movement.moved) {
      const systemOutput = dispatchSystemVerbs(verbs, {
        store,
        player,
        systemVerbs: [SYSTEM_VERBS.ENTER, SYSTEM_VERBS.TICK],
      });
      parts.push(...systemOutput);
    }
    return {
      output: parts.join("\n"),
      debug: debug ? { parse: `go ${movement.direction}`, outcome: "movement" } : undefined,
    };
  }

  // Parse and resolve through the verb system
  const parsed = parseCommand(input);
  if (!parsed) {
    return {
      output: `I don't understand "${input}". Type "help" for commands.`,
      debug: debug ? { parse: input, outcome: "unparseable" } : undefined,
    };
  }

  const room = getPlayerRoom(store);

  const resolved = resolveCommand(parsed, {
    store,
    roomId: room.id,
    playerId: player.id,
  });

  if (typeof resolved === "string") {
    return {
      output: resolved,
      debug: debug ? { parse: describeParsed(parsed), outcome: "resolution-failed" } : undefined,
    };
  }

  const context: VerbContext = { store, command: resolved, player, room };
  const result = verbs.dispatch(context);

  if (result.outcome === "performed") {
    const parts = [result.output];
    if (!result.freeTurn) {
      const systemOutput = dispatchSystemVerbs(verbs, {
        store,
        player,
        systemVerbs: [SYSTEM_VERBS.TICK],
      });
      parts.push(...systemOutput);
    }
    return {
      output: parts.join("\n"),
      debug: debug
        ? {
            parse: describeResolved(resolved),
            outcome: "performed",
            handler: result.handler,
            source: result.source,
            events: result.events.map((e) => ({
              description: e.description,
              entityId: e.entityId,
              property: e.property,
              value: e.value,
            })),
          }
        : undefined,
    };
  }
  if (result.outcome === "vetoed") {
    return {
      output: result.output,
      debug: debug
        ? { parse: describeResolved(resolved), outcome: "vetoed", vetoedBy: result.vetoedBy }
        : undefined,
    };
  }

  return {
    output: `I don't know how to "${input}". Type "help" for commands.`,
    debug: debug ? { parse: describeParsed(parsed), outcome: "unhandled" } : undefined,
  };
}

function entityLabel(entity: Entity): string {
  const name = (entity.properties["name"] as string) || entity.id;
  return `${name} [${entity.id}]`;
}

function describeParsed(parsed: ReturnType<typeof parseCommand>): string {
  if (!parsed) return "?";
  if (parsed.form === "intransitive") return parsed.verb;
  if (parsed.form === "transitive") return `${parsed.verb} "${parsed.object}"`;
  if (parsed.form === "prepositional") return `${parsed.verb} ${parsed.prep} "${parsed.object}"`;
  return `${parsed.verb} "${parsed.object}" ${parsed.prep} "${parsed.indirect}"`;
}

function describeResolved(resolved: ResolvedCommand): string {
  if (resolved.form === "intransitive") return resolved.verb;
  if (resolved.form === "transitive") return `${resolved.verb} ${entityLabel(resolved.object)}`;
  if (resolved.form === "prepositional") {
    return `${resolved.verb} ${resolved.prep} ${entityLabel(resolved.object)}`;
  }
  return `${resolved.verb} ${entityLabel(resolved.object)} ${resolved.prep} ${entityLabel(resolved.indirect)}`;
}
