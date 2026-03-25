import type { Entity } from "./entity.js";
import type {
  VerbHandler,
  VerbContext,
  CheckResult,
  VetoResult,
  PerformResult,
} from "./verb-types.js";
import type { HandlerData } from "./game-data.js";
import { HandlerLib } from "./handler-lib.js";

function getTarget(context: VerbContext): Entity | null {
  if (context.command.form === "transitive" || context.command.form === "prepositional") {
    return context.command.object;
  }
  if (context.command.form === "ditransitive") {
    return context.command.object;
  }
  return null;
}

function getIndirect(context: VerbContext): Entity | null {
  if (context.command.form === "ditransitive") {
    return context.command.indirect;
  }
  return null;
}

function buildCheck(code: string): (context: VerbContext) => CheckResult {
  const fn = new Function("lib", "object", "indirect", "player", "room", "store", "command", code);
  return (context: VerbContext): CheckResult => {
    const lib = new HandlerLib(context);
    const result = fn(
      lib,
      getTarget(context),
      getIndirect(context),
      context.player,
      context.room,
      context.store,
      context.command,
    );
    return { applies: !!result };
  };
}

function buildVeto(code: string): (context: VerbContext) => VetoResult {
  const fn = new Function("lib", "object", "indirect", "player", "room", "store", "command", code);
  return (context: VerbContext): VetoResult => {
    const lib = new HandlerLib(context);
    const result = fn(
      lib,
      getTarget(context),
      getIndirect(context),
      context.player,
      context.room,
      context.store,
      context.command,
    );
    if (typeof result === "string") {
      return { blocked: true, output: result };
    }
    return { blocked: false };
  };
}

function buildPerform(code: string): (context: VerbContext) => PerformResult {
  const fn = new Function("lib", "object", "indirect", "player", "room", "store", "command", code);
  return (context: VerbContext): PerformResult => {
    const lib = new HandlerLib(context);
    const result = fn(
      lib,
      getTarget(context),
      getIndirect(context),
      context.player,
      context.room,
      context.store,
      context.command,
    ) as PerformResult;
    if (!result || typeof result.output !== "string") {
      return { output: "Something strange happens, but nothing changes.", events: [] };
    }
    if (!Array.isArray(result.events)) {
      return { output: result.output, events: [] };
    }
    return result;
  };
}

/** Convert a HandlerData record into a live VerbHandler */
export function handlerDataToHandler(data: HandlerData): VerbHandler {
  return {
    name: data.name,
    source: "game-data",
    pattern: data.pattern,
    priority: data.priority || 0,
    freeTurn: data.freeTurn,
    entityId: data.entityId,
    tag: data.tag,
    objectRequirements: data.objectRequirements,
    indirectRequirements: data.indirectRequirements,
    check: data.check ? buildCheck(data.check) : undefined,
    veto: data.veto ? buildVeto(data.veto) : undefined,
    perform: buildPerform(data.perform),
  };
}
