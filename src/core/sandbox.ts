import { createContext, runInNewContext } from "node:vm";

/** Default timeout for sandboxed code execution (ms) */
const DEFAULT_TIMEOUT_MS = 5000;

/** Globals that are explicitly blocked in the sandbox */
const BLOCKED_GLOBALS: Record<string, undefined> = {
  process: undefined,
  require: undefined,
  global: undefined,
  globalThis: undefined,
  module: undefined,
  __dirname: undefined,
  __filename: undefined,
  Buffer: undefined,
  fetch: undefined,
  XMLHttpRequest: undefined,
  WebSocket: undefined,
  Worker: undefined,
  setTimeout: undefined,
  setInterval: undefined,
  setImmediate: undefined,
  clearTimeout: undefined,
  clearInterval: undefined,
  clearImmediate: undefined,
  queueMicrotask: undefined,
  structuredClone: undefined,
};

/**
 * Run a code string in a sandboxed V8 context with a timeout.
 *
 * The code is wrapped in a function body (so `return` works) and
 * executed with only the provided variables in scope. Node/browser
 * globals are blocked.
 */
export function runSandboxed(code: string, variables: Record<string, unknown>): unknown {
  const sandbox = { ...BLOCKED_GLOBALS, ...variables, __result: undefined as unknown };
  const context = createContext(sandbox);
  runInNewContext("__result = (function() { " + code + " })();", context, {
    timeout: DEFAULT_TIMEOUT_MS,
  });
  return sandbox.__result;
}

/**
 * Build a reusable sandboxed function from a code string.
 * Returns a function that accepts variables and runs the code.
 */
export function buildSandboxedFunction(
  code: string,
): (variables: Record<string, unknown>) => unknown {
  const wrappedCode = "__result = (function() { " + code + " })();";
  return (variables: Record<string, unknown>): unknown => {
    const sandbox = { ...BLOCKED_GLOBALS, ...variables, __result: undefined as unknown };
    const context = createContext(sandbox);
    runInNewContext(wrappedCode, context, { timeout: DEFAULT_TIMEOUT_MS });
    return sandbox.__result;
  };
}

/**
 * Evaluate a template expression in a sandboxed environment.
 * The code is a template literal body (no backticks).
 */
export function evalTemplate(template: string, variables: Record<string, unknown>): string {
  const sandbox = { ...BLOCKED_GLOBALS, ...variables, __result: undefined as unknown };
  const context = createContext(sandbox);
  runInNewContext("__result = `" + template + "`;", context, { timeout: DEFAULT_TIMEOUT_MS });
  const result = sandbox.__result;
  return typeof result === "string" ? result : String(result);
}
