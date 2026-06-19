import { WorkerEntrypoint } from "cloudflare:workers";
import {
  LIB_PROXY_PRELUDE,
  type HandlerRun,
  type LibDispatch,
  type Sandbox,
} from "../core/sandbox-host.js";

export class SandboxRegistryError extends Error {
  constructor(token: string) {
    super("No live lib registered for sandbox token " + token);
    this.name = "SandboxRegistryError";
  }
}

// --- Hand-rolled Worker Loader binding types (see r2-types.ts convention) ---

interface WorkerCode {
  compatibilityDate: string;
  mainModule: string;
  modules: Record<string, string>;
  env?: Record<string, unknown>;
  /** null = the isolate is fully cut off from the network. */
  globalOutbound: null;
}

interface LoadedEntrypoint {
  run(input: unknown): Promise<unknown>;
}

interface WorkerStub {
  getEntrypoint(name: string): LoadedEntrypoint;
}

export interface WorkerLoaderBinding {
  get(id: string, getCode: () => Promise<WorkerCode>): WorkerStub;
}

/** The subset of the parent's ExecutionContext the sandbox uses. */
export interface LoaderCtx {
  exports: { LibEntry(opts: { props: { token: string } }): unknown };
}

// --- Per-request registry: token -> live lib dispatch ---
// The dynamic isolate calls back via the LibEntry stub, which looks the live
// lib up by the token baked into its props. Keyed per request so concurrent
// requests in the same parent isolate never collide.

const registry = new Map<string, LibDispatch>();
let tokenCounter = 0;

/**
 * Parent-side RPC entrypoint the dynamic isolate calls as `env.LIB.invoke`.
 * Must be re-exported from the Worker's main module so `ctx.exports.LibEntry`
 * resolves. Runs the authentic (base + per-game) lib over the live store.
 */
export class LibEntry extends WorkerEntrypoint<unknown, { token: string }> {
  async invoke(method: string, args: unknown[]): Promise<unknown> {
    const lib = registry.get(this.ctx.props.token);
    if (!lib) throw new SandboxRegistryError(this.ctx.props.token);
    return lib.invoke(method, Array.isArray(args) ? args : []);
  }
}

/** Build the dynamic-isolate module that runs one handler. The handler code is
 *  baked into the module source (the isolate forbids runtime codegen), reads
 *  scope from the RPC arg, and bridges `lib` to `env.LIB.invoke`. */
function buildHandlerModule(code: string): string {
  return (
    'import { WorkerEntrypoint } from "cloudflare:workers";\n' +
    "export class Handler extends WorkerEntrypoint {\n" +
    "  async run(input) {\n" +
    "    const scope = input && input.scope ? input.scope : {};\n" +
    "    const object = scope.object, indirect = scope.indirect, player = scope.player, room = scope.room, command = scope.command;\n" +
    "    globalThis.__invoke = (name, args) => this.env.LIB.invoke(name, args);\n" +
    LIB_PROXY_PRELUDE +
    "\n    const __ret = await (async function() {\n" +
    code +
    "\n    })();\n" +
    "    return __ret === undefined ? null : __ret;\n" +
    "  }\n" +
    "}\n"
  );
}

/**
 * Production sandbox: runs handler code in a Cloudflare dynamic isolate via the
 * Worker Loader binding. The isolate gets only the LIB capability (lib calls
 * back into the parent) and no network (globalOutbound: null).
 */
export class WorkerLoaderSandbox implements Sandbox {
  #loader: WorkerLoaderBinding;
  #ctx: LoaderCtx;

  constructor(loader: WorkerLoaderBinding, ctx: LoaderCtx) {
    this.#loader = loader;
    this.#ctx = ctx;
  }

  async runHandler(run: HandlerRun): Promise<unknown> {
    const token = "sbx-" + ++tokenCounter;
    registry.set(token, run.lib);
    try {
      const lib = this.#ctx.exports.LibEntry({ props: { token } });
      const module = buildHandlerModule(run.code);
      // Unique id per request so the fresh LIB capability is baked in each
      // time. (Future optimization: cache by code hash and pass LIB via the
      // RPC arg instead of env.)
      const stub = this.#loader.get(token, async () => ({
        compatibilityDate: "2024-12-01",
        mainModule: "handler.js",
        modules: { "handler.js": module },
        env: { LIB: lib },
        globalOutbound: null,
      }));
      return await stub.getEntrypoint("Handler").run({ scope: run.scope });
    } finally {
      registry.delete(token);
    }
  }
}
