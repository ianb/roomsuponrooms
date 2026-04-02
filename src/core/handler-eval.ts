import type { Entity } from "./entity.js";
import type {
  VerbHandler,
  VerbContext,
  CheckResult,
  VetoResult,
  PerformResult,
  WorldEvent,
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
    try {
      const result = fn(handlerVars(context, createLib));
      return { applies: !!result };
    } catch (err: unknown) {
      console.error(`[handler-eval] Check code threw: ${err instanceof Error ? err.message : err}`);
      return { applies: false };
    }
  };
}

function buildVeto(code: string, createLib: LibFactory): (context: VerbContext) => VetoResult {
  const fn = buildSandboxedFunction(code);
  return (context: VerbContext): VetoResult => {
    try {
      const result = fn(handlerVars(context, createLib));
      if (typeof result === "string") {
        return { blocked: true, output: result };
      }
      return { blocked: false };
    } catch (err: unknown) {
      console.error(`[handler-eval] Veto code threw: ${err instanceof Error ? err.message : err}`);
      return { blocked: false };
    }
  };
}

function validateEvent(e: unknown): WorldEvent | null {
  if (typeof e !== "object" || e === null) return null;
  const obj = e as Record<string, unknown>;
  if (typeof obj.type !== "string" || typeof obj.entityId !== "string") return null;
  if (typeof obj.description !== "string") obj.description = "";
  return obj as unknown as WorldEvent;
}

function buildPerform(
  code: string,
  createLib: LibFactory,
): (context: VerbContext) => PerformResult {
  const fn = buildSandboxedFunction(code);
  return (context: VerbContext): PerformResult => {
    const raw = fn(handlerVars(context, createLib));
    if (!raw || typeof raw !== "object") {
      return { output: "Something strange happens, but nothing changes.", events: [] };
    }
    const result = raw as Record<string, unknown>;
    const output = typeof result.output === "string" ? result.output : "";
    const events: WorldEvent[] = [];
    if (Array.isArray(result.events)) {
      for (const e of result.events) {
        const valid = validateEvent(e);
        if (valid) events.push(valid);
      }
    }
    return { output, events };
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
