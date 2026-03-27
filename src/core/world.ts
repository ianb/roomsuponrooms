import type { EntityStore, Entity } from "./entity.js";
import type { VerbContext, VerbRegistry, ResolvedCommand, WorldEvent } from "./verbs.js";
import { parseCommand, resolveCommand } from "./verbs.js";
import { SYSTEM_VERBS } from "./verb-types.js";
import { describeParsed, describeResolved } from "./debug-helpers.js";
import { tryMovement, getPlayer, getPlayerRoom } from "./movement.js";
import type { UnresolvedExitContext } from "./movement.js";

export { getPlayer, getPlayerRoom } from "./movement.js";
export type { UnresolvedExitContext } from "./movement.js";

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
    schema?: unknown;
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
  /** Present when the player tried to go through an exit with destinationIntent but no destination */
  unresolvedExit?: UnresolvedExitContext;
  /** Present when the object could not be resolved — includes verb and object name for scenery check */
  unresolvedObject?: { verb: string; objectName: string };
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
    if (movement.unresolvedExit) {
      return {
        output: "",
        events: [],
        unresolvedExit: movement.unresolvedExit,
        debug: debug
          ? { parse: `go ${movement.direction}`, outcome: "unresolved-exit" }
          : undefined,
      };
    }
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
      output: `{!I don't understand "${input}". Type "help" for commands.!}`,
      events: [],
      debug: debug ? { parse: input, outcome: "unparseable" } : undefined,
    };
  }

  const room = getPlayerRoom(store);
  const resolved = resolveCommand(parsed, { store, roomId: room.id, playerId: player.id });

  if (typeof resolved === "string") {
    // Extract the object name for scenery fallback
    const objectName =
      parsed.form === "transitive" || parsed.form === "prepositional"
        ? parsed.object
        : parsed.form === "ditransitive"
          ? parsed.object
          : undefined;
    return {
      output: resolved,
      events: [],
      debug: debug ? { parse: describeParsed(parsed), outcome: "resolution-failed" } : undefined,
      unresolvedObject: objectName ? { verb: parsed.verb, objectName } : undefined,
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
    output: `{!I don't know how to "${input}". Type "help" for commands.!}`,
    events: [],
    debug: debug ? { parse: describeParsed(parsed), outcome: "unhandled" } : undefined,
    unhandled: { command: resolved, player, room },
  };
}
