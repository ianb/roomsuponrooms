import { getQuickJS, type QuickJSContext, type QuickJSHandle } from "quickjs-emscripten";
import {
  LIB_PROXY_PRELUDE,
  type HandlerRun,
  type LibDispatch,
  type Sandbox,
} from "../core/sandbox-host.js";

export class SandboxExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxExecutionError";
  }
}

const MEMORY_BYTES = 16 * 1024 * 1024;
const TIMEOUT_MS = 1000;

/** Marshal a plain value into the guest by evaluating its JSON text there, so
 *  the resulting value's prototype belongs to the guest realm. */
function marshalIn(vm: QuickJSContext, value: unknown): QuickJSHandle {
  if (value === undefined) return vm.undefined;
  return vm.unwrapResult(vm.evalCode("(" + JSON.stringify(value) + ")"));
}

/**
 * Local-dev sandbox: runs handler code in a QuickJS-WASM isolate in-process.
 * `lib` calls are synchronous host calls (the store is in-memory) returned as
 * plain values; handler code still `await`s them, matching the Worker Loader
 * contract exactly.
 */
export class NodeQuickJsSandbox implements Sandbox {
  async runHandler(run: HandlerRun): Promise<unknown> {
    const QuickJS = await getQuickJS();
    const runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(MEMORY_BYTES);
    const deadline = Date.now() + TIMEOUT_MS;
    runtime.setInterruptHandler(() => Date.now() > deadline);
    const vm = runtime.newContext();
    try {
      for (const [key, value] of Object.entries(run.scope)) {
        const h = marshalIn(vm, value);
        vm.setProp(vm.global, key, h);
        h.dispose();
      }
      this.installInvoke(vm, run.lib);
      const wrapped =
        "(async () => {\n" +
        LIB_PROXY_PRELUDE +
        "\nconst __ret = await (async function() {\n" +
        run.code +
        "\n})();\nreturn JSON.stringify(__ret === undefined ? null : __ret);\n})()";
      const evalResult = vm.evalCode(wrapped);
      if (evalResult.error) {
        const err = vm.dump(evalResult.error);
        evalResult.error.dispose();
        throw new SandboxExecutionError("handler threw: " + JSON.stringify(err));
      }
      const promiseHandle = evalResult.value;
      const settled = vm.resolvePromise(promiseHandle);
      promiseHandle.dispose();
      runtime.executePendingJobs();
      const resolved = await settled;
      if (resolved.error) {
        const err = vm.dump(resolved.error);
        resolved.error.dispose();
        throw new SandboxExecutionError("handler rejected: " + JSON.stringify(err));
      }
      const json = vm.getString(resolved.value);
      resolved.value.dispose();
      const parsed: unknown = JSON.parse(json);
      return parsed;
    } finally {
      vm.dispose();
      runtime.dispose();
    }
  }

  /** Install globalThis.__invoke(name, args) as a sync host bridge to the real
   *  game lib. Args/returns are JSON-marshalled. */
  private installInvoke(vm: QuickJSContext, lib: LibDispatch): void {
    const handle = vm.newFunction("__invoke", (nameHandle, argsHandle) => {
      const name = vm.dump(nameHandle);
      const args = vm.dump(argsHandle);
      const method = typeof name === "string" ? name : "";
      const argArray = Array.isArray(args) ? args : [];
      return marshalIn(vm, lib.invoke(method, argArray));
    });
    vm.setProp(vm.global, "__invoke", handle);
    handle.dispose();
  }
}
