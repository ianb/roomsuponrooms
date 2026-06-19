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
import { getSandbox, coerceEvents, type LibDispatch } from "./sandbox-host.js";

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

/** A JSON-safe view of the resolved command (entities live in scope separately). */
function commandSnapshot(context: VerbContext): Record<string, unknown> {
  const c = context.command;
  const snap: Record<string, unknown> = { form: c.form, verb: c.verb };
  if (c.form === "prepositional" || c.form === "ditransitive") snap.prep = c.prep;
  return snap;
}

/** Strip designer-only fields (the hidden `secret` and the `ai` prompt config)
 *  from entity-shaped values before they cross into untrusted handler code, so a
 *  handler can't exfiltrate them via `room.secret` or `lib.contents(id)`. */
export function redactEntityFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactEntityFields);
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.id === "string" && ("properties" in o || "tags" in o)) {
      const copy = { ...o };
      delete copy.secret;
      delete copy.ai;
      return copy;
    }
  }
  return value;
}

/** Build the JSON scope handed into the sandbox: redacted entity snapshots, never live objects. */
function handlerScope(context: VerbContext): Record<string, unknown> {
  const target = getTarget(context);
  const indirect = getIndirect(context);
  const snap = (id: string): unknown => redactEntityFields(context.store.getSnapshot(id));
  const scope: Record<string, unknown> = {
    player: snap(context.player.id),
    room: snap(context.room.id),
    command: commandSnapshot(context),
  };
  if (target) scope.object = snap(target.id);
  if (indirect) scope.indirect = snap(indirect.id);
  return scope;
}

// Methods reachable on every object that must never be callable through the
// bridge — otherwise handler code could invoke e.g. lib.valueOf() (serializing
// the live store/player/room) or reach the prototype chain.
const BLOCKED_LIB_METHODS = new Set<string>([
  "prototype",
  "__proto__",
  ...Object.getOwnPropertyNames(Object.prototype),
]);

/** Bridge a live game lib instance into the generic LibDispatch the sandbox
 *  forwards every `lib.method(...)` call to. Methods run in the parent over the
 *  live store; args (snapshots / ids) and returns pass through as JSON. */
export function libDispatch(lib: HandlerLib): LibDispatch {
  const target = lib as unknown as Record<string, unknown>;
  return {
    invoke: (method, args) => {
      if (BLOCKED_LIB_METHODS.has(method)) {
        throw new UnknownLibMethodError(method);
      }
      const fn = target[method];
      if (typeof fn !== "function") {
        throw new UnknownLibMethodError(method);
      }
      // Redact designer-only fields from any entity(s) the lib returns.
      return redactEntityFields((fn as (...a: unknown[]) => unknown).apply(lib, args));
    },
  };
}

export class UnknownLibMethodError extends Error {
  constructor(method: string) {
    super("Handler called unknown lib method: " + method);
    this.name = "UnknownLibMethodError";
  }
}

function runHandlerCode(
  context: VerbContext,
  { code, createLib }: { code: string; createLib: LibFactory },
): Promise<unknown> {
  return getSandbox().runHandler({
    code,
    scope: handlerScope(context),
    lib: libDispatch(createLib(context)),
  });
}

function buildCheck(
  code: string,
  createLib: LibFactory,
): (context: VerbContext) => Promise<CheckResult> {
  return async (context: VerbContext): Promise<CheckResult> => {
    try {
      const result = await runHandlerCode(context, { code, createLib });
      return { applies: !!result };
    } catch (err: unknown) {
      console.error(`[handler-eval] Check code threw: ${err instanceof Error ? err.message : err}`);
      return { applies: false };
    }
  };
}

function buildVeto(
  code: string,
  createLib: LibFactory,
): (context: VerbContext) => Promise<VetoResult> {
  return async (context: VerbContext): Promise<VetoResult> => {
    try {
      const result = await runHandlerCode(context, { code, createLib });
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

function buildPerform(
  code: string,
  createLib: LibFactory,
): (context: VerbContext) => Promise<PerformResult> {
  return async (context: VerbContext): Promise<PerformResult> => {
    const raw = await runHandlerCode(context, { code, createLib });
    if (!raw || typeof raw !== "object") {
      return { output: "Something strange happens, but nothing changes.", events: [] };
    }
    const result = raw as Record<string, unknown>;
    const output = typeof result.output === "string" ? result.output : "";
    return { output, events: coerceEvents(raw) };
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
    // Stash the original HandlerData so partial agent updates can merge into
    // it without losing the other fields.
    data,
  };
}
