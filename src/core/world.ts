import type { EntityStore, Entity } from "./entity.js";
import type { VerbContext, VerbRegistry, ResolvedCommand, WorldEvent } from "./verbs.js";
import { parseCommand, resolveCommand } from "./verbs.js";
import { SYSTEM_VERBS } from "./verb-types.js";
import { describeRoomFull } from "./describe.js";
import { isRoomLit, darknessDescription } from "./darkness.js";
import { describeParsed, describeResolved } from "./debug-helpers.js";

export interface DebugInfo {
  /** e.g. "look", "take lantern", "put key in chest" */
  parse: string;
  outcome: string;
  handler?: string;
  source?: string;
  events?: DebugEvent[];
  vetoedBy?: string;
  /** AI fallback debug info, added by the server layer */
  aiFallback?: {
    systemPrompt: string;
    prompt: string;
    response: unknown;
    durationMs: number;
  };
}

export interface DebugEvent {
  description: string;
  entityId: string;
  property?: string;
  value?: unknown;
}

export interface UnhandledContext {
  command: ResolvedCommand;
  player: Entity;
  room: Entity;
}

export interface CommandResult {
  output: string;
  /** All events that were applied during this command */
  events: WorldEvent[];
  debug?: DebugInfo;
  /** Present when the verb was parsed and resolved but no handler matched */
  unhandled?: UnhandledContext;
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
  events: WorldEvent[];
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
      return { output: `The ${exitName} is locked.`, direction, moved: false, events: [] };
    }
    const events: WorldEvent[] = [];
    // Auto-open unlocked doors
    if (exit.tags.has("openable") && exit.properties["open"] !== true) {
      events.push({
        type: "set-property",
        entityId: exit.id,
        property: "open",
        value: true,
        description: "Auto-opened door",
      });
      const pairedId = exit.properties["pairedDoor"] as string | undefined;
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
    const destination = exit.properties["destination"] as string;
    const player = getPlayer(store);
    events.push({
      type: "set-property",
      entityId: player.id,
      property: "location",
      value: destination,
      oldValue: player.properties["location"],
      description: `Moved ${direction}`,
    });
    // Apply events
    for (const event of events) {
      if (event.property) {
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
    const exitDirs = exits.map((e) => e.properties["direction"] as string);
    return {
      output: `You can't go ${direction}. Available exits: ${exitDirs.join(", ")}`,
      direction,
      moved: false,
      events: [],
    };
  }

  return null;
}

function dispatchSystemVerbs(
  verbs: VerbRegistry,
  { store, player, systemVerbs }: { store: EntityStore; player: Entity; systemVerbs: string[] },
): { outputs: string[]; events: WorldEvent[] } {
  const allOutputs: string[] = [];
  const allEvents: WorldEvent[] = [];
  for (const verb of systemVerbs) {
    const currentRoom = getPlayerRoom(store);
    const context: VerbContext = {
      store,
      command: { form: "intransitive", verb },
      player,
      room: currentRoom,
    };
    const result = verbs.dispatchSystem(verb, context);
    allOutputs.push(...result.outputs);
    allEvents.push(...result.events);
  }
  return { outputs: allOutputs, events: allEvents };
}

/** Fire [encounter] for each entity in the current room */
function dispatchEncounters(
  verbs: VerbRegistry,
  { store, player }: { store: EntityStore; player: Entity },
): { outputs: string[]; events: WorldEvent[] } {
  const room = getPlayerRoom(store);
  const contents = store.getContents(room.id);
  const allOutputs: string[] = [];
  const allEvents: WorldEvent[] = [];
  for (const entity of contents) {
    if (entity.id === player.id) continue;
    if (entity.tags.has("exit")) continue;
    const context: VerbContext = {
      store,
      command: { form: "transitive", verb: SYSTEM_VERBS.ENCOUNTER, object: entity },
      player,
      room,
    };
    const result = verbs.dispatchSystem(SYSTEM_VERBS.ENCOUNTER, context);
    allOutputs.push(...result.outputs);
    allEvents.push(...result.events);
  }
  return { outputs: allOutputs, events: allEvents };
}

export function processCommand(
  store: EntityStore,
  { input, verbs, debug }: { input: string; verbs: VerbRegistry; debug?: boolean },
): CommandResult {
  const player = getPlayer(store);

  const movement = tryMovement(store, input);
  if (movement) {
    const parts = [movement.output];
    const allEvents = [...movement.events];
    if (movement.moved) {
      const sys = dispatchSystemVerbs(verbs, {
        store,
        player,
        systemVerbs: [SYSTEM_VERBS.ENTER, SYSTEM_VERBS.TICK],
      });
      parts.push(...sys.outputs);
      allEvents.push(...sys.events);
      const enc = dispatchEncounters(verbs, { store, player });
      parts.push(...enc.outputs);
      allEvents.push(...enc.events);
    }
    return {
      output: parts.join("\n"),
      events: allEvents,
      debug: debug ? { parse: `go ${movement.direction}`, outcome: "movement" } : undefined,
    };
  }

  const parsed = parseCommand(input);
  if (!parsed) {
    return {
      output: `I don't understand "${input}". Type "help" for commands.`,
      events: [],
      debug: debug ? { parse: input, outcome: "unparseable" } : undefined,
    };
  }

  const room = getPlayerRoom(store);
  const resolved = resolveCommand(parsed, { store, roomId: room.id, playerId: player.id });

  if (typeof resolved === "string") {
    return {
      output: resolved,
      events: [],
      debug: debug ? { parse: describeParsed(parsed), outcome: "resolution-failed" } : undefined,
    };
  }

  const context: VerbContext = { store, command: resolved, player, room };
  const result = verbs.dispatch(context);

  if (result.outcome === "performed") {
    const parts = [result.output];
    const allEvents = [...result.events];
    if (!result.freeTurn) {
      const sys = dispatchSystemVerbs(verbs, {
        store,
        player,
        systemVerbs: [SYSTEM_VERBS.TICK],
      });
      parts.push(...sys.outputs);
      allEvents.push(...sys.events);
    }
    return {
      output: parts.join("\n"),
      events: allEvents,
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
      events: [],
      debug: debug
        ? { parse: describeResolved(resolved), outcome: "vetoed", vetoedBy: result.vetoedBy }
        : undefined,
    };
  }

  return {
    output: `I don't know how to "${input}". Type "help" for commands.`,
    events: [],
    debug: debug ? { parse: describeParsed(parsed), outcome: "unhandled" } : undefined,
    unhandled: { command: resolved, player, room },
  };
}
