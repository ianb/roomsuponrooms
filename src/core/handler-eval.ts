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
import { buildSandboxedFunction } from "./sandbox.js";

export type LibFactory = (context: VerbContext) => HandlerLib;

const defaultLibFactory: LibFactory = (context) => new HandlerLib(context);

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

function handlerVars(context: VerbContext, createLib: LibFactory): Record<string, unknown> {
  return {
    lib: createLib(context),
    object: getTarget(context),
    indirect: getIndirect(context),
    player: context.player,
    room: context.room,
    store: context.store,
    command: context.command,
  };
}

function buildCheck(code: string, createLib: LibFactory): (context: VerbContext) => CheckResult {
  const fn = buildSandboxedFunction(code);
  return (context: VerbContext): CheckResult => {
    const result = fn(handlerVars(context, createLib));
    return { applies: !!result };
  };
}

function buildVeto(code: string, createLib: LibFactory): (context: VerbContext) => VetoResult {
  const fn = buildSandboxedFunction(code);
  return (context: VerbContext): VetoResult => {
    const result = fn(handlerVars(context, createLib));
    if (typeof result === "string") {
      return { blocked: true, output: result };
    }
    return { blocked: false };
  };
}

function buildPerform(
  code: string,
  createLib: LibFactory,
): (context: VerbContext) => PerformResult {
  const fn = buildSandboxedFunction(code);
  return (context: VerbContext): PerformResult => {
    const result = fn(handlerVars(context, createLib)) as PerformResult;
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
export function handlerDataToHandler(
  data: HandlerData,
  options?: { libFactory?: LibFactory },
): VerbHandler {
  const createLib = (options && options.libFactory) || defaultLibFactory;
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
    check: data.check ? buildCheck(data.check, createLib) : undefined,
    veto: data.veto ? buildVeto(data.veto, createLib) : undefined,
    perform: buildPerform(data.perform, createLib),
  };
}
