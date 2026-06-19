import $t from "sval";

// ⚠️ LEGACY, INSECURE. SVal is an in-realm interpreter: the blocklist below is
// bypassable via `({}).constructor.constructor(...)`, which escapes to the host
// realm (and, in the production Worker, host secrets in process.env). Verb
// handlers moved to the Worker Loader sandbox (sandbox-host.ts) and templates
// moved to the safe AST evaluator (template-eval.ts). The ONLY remaining caller
// is:
//   - runSandboxed — conversation word `perform` code (currently unused by any
//     shipped game; migrate to the Worker Loader sandbox before relying on it)
// Do NOT add new callers. This last use still needs to be closed.

/** Globals that are explicitly blocked in the sandbox */
const BLOCKED_GLOBALS: Record<string, undefined> = {
  process: undefined,
  require: undefined,
  global: undefined,
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
};

/**
 * Run a code string in a sandboxed SVal interpreter.
 *
 * The code is wrapped in a function body (so `return` works) and
 * executed with only the provided variables in scope. Node/browser
 * globals are blocked.
 */
export function runSandboxed(code: string, variables: Record<string, unknown>): unknown {
  const interpreter = new $t({
    ecmaVer: "latest",
    sourceType: "script",
    sandBox: true,
  });
  interpreter.import({ ...BLOCKED_GLOBALS, ...variables });
  interpreter.run("exports.result = (function() { " + code + " })();");
  return interpreter.exports.result;
}
