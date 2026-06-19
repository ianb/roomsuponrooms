import { AsyncLocalStorage } from "node:async_hooks";
import type { WorldEvent } from "./verb-types.js";

/**
 * Engine-agnostic contract for running untrusted handler code in an isolate
 * with a strict JSON boundary.
 *
 * Two implementations satisfy this:
 *  - WorkerLoaderSandbox (production): a Cloudflare dynamic isolate; `lib` calls
 *    cross back into the parent as async RPC (ctx.exports).
 *  - NodeQuickJsSandbox (local dev): a QuickJS-WASM isolate in-process; `lib`
 *    calls are synchronous host calls.
 *
 * `lib` is game-extensible and many methods have side effects (mutating the
 * store, consuming the seeded RNG) — so rather than enumerate it, the isolate
 * exposes a generic Proxy that forwards every `lib.method(...args)` call to the
 * parent's real lib via a single `invoke`. Handler code always `await`s lib
 * calls, so the contract is identical across engines and the parent runs the
 * authentic (base + per-game) lib over the live store.
 */

/** Host-side bridge: dispatch a lib method call to the real game lib. */
export interface LibDispatch {
  invoke(method: string, args: unknown[]): unknown;
}

export interface HandlerRun {
  /** The untrusted handler code string (a function body that returns). */
  code: string;
  /** JSON scope globals (e.g. object, indirect, player, room, command snapshots). */
  scope: Record<string, unknown>;
  /** Bridge to the live, request-scoped game lib. */
  lib: LibDispatch;
}

export interface Sandbox {
  /** Run handler code; resolves to the JSON value the handler returned. */
  runHandler(run: HandlerRun): Promise<unknown>;
}

export class SandboxNotConfiguredError extends Error {
  constructor() {
    super("No sandbox configured — call setSandbox()/runWithSandbox() in the entry point");
    this.name = "SandboxNotConfiguredError";
  }
}

// The Worker builds a per-request sandbox that closes over the request's
// ExecutionContext (ctx.exports). Cloudflare interleaves concurrent requests in
// one isolate across awaits, so that sandbox must NOT live in a shared module
// global — it's scoped per request via AsyncLocalStorage. Node uses a stateless
// singleton sandbox, so it just sets the fallback once at startup.
const scope = new AsyncLocalStorage<Sandbox>();
let fallback: Sandbox | null = null;

export function setSandbox(sandbox: Sandbox): void {
  fallback = sandbox;
}

/** Run `fn` with `sandbox` as the active sandbox for its async context. */
export function runWithSandbox<T>(sandbox: Sandbox, fn: () => T): T {
  return scope.run(sandbox, fn);
}

export function getSandbox(): Sandbox {
  const scoped = scope.getStore();
  if (scoped) return scoped;
  if (fallback) return fallback;
  throw new SandboxNotConfiguredError();
}

/**
 * JS injected ahead of handler code. Builds `lib` as a Proxy that forwards
 * every method call to `globalThis.__invoke(name, args)` — the host bridge each
 * executor installs (a sync host call in QuickJS, an async RPC in Worker
 * Loader). Either way handler code does `await lib.method(...)`.
 */
export const LIB_PROXY_PRELUDE = `
const lib = new Proxy({}, {
  get(_target, name) {
    if (typeof name !== "string") return undefined;
    // Always a Promise — so dev (QuickJS, sync host call) and prod (Worker
    // Loader, async RPC) behave identically and missing \`await\`s fail in both.
    return (...args) => Promise.resolve(globalThis.__invoke(name, args));
  },
});
`;

/** Shape a raw handler return value into a WorldEvent[]-bearing result. */
export function coerceEvents(raw: unknown): WorldEvent[] {
  if (!raw || typeof raw !== "object") return [];
  const events = (raw as { events?: unknown }).events;
  if (!Array.isArray(events)) return [];
  const out: WorldEvent[] = [];
  for (const e of events) {
    if (!e || typeof e !== "object") continue;
    const obj = e as Record<string, unknown>;
    if (typeof obj.type !== "string" || typeof obj.entityId !== "string") continue;
    if (typeof obj.description !== "string") obj.description = "";
    out.push(obj as unknown as WorldEvent);
  }
  return out;
}
