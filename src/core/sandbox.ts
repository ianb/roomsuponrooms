import $t from "sval";

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
 * Prepare variables for sandbox import by creating plain wrapper objects
 * for class instances. sval doesn't preserve prototype chains, so
 * inherited methods like lib.tryGet() would be invisible without this.
 */

/**
 * Run a code string in a sandboxed SVal interpreter.
 *
 * The code is wrapped in a function body (so `return` works) and
 * executed with only the provided variables in scope. Node/browser
 * globals are blocked.
 */
/**
 * Build code that injects bound method helpers as top-level variables.
 * e.g. for lib.tryGet, creates: var __lib_tryGet = __methods.lib_tryGet;
 * Then rewrites lib.tryGet calls to use __lib_tryGet.
 */
function buildMethodInjections(variables: Record<string, unknown>): {
  methods: Record<string, unknown>;
  preamble: string;
} {
  const methods: Record<string, unknown> = {};
  const lines: string[] = [];
  for (const [key, value] of Object.entries(variables)) {
    if (value === null || typeof value !== "object") continue;
    let proto = Object.getPrototypeOf(value) as Record<string, unknown> | null;
    while (proto && proto !== Object.prototype) {
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === "constructor") continue;
        const desc = Object.getOwnPropertyDescriptor(proto, name);
        if (desc && typeof desc.value === "function") {
          const methodKey = `${key}_${name}`;
          methods[methodKey] = (desc.value as (...args: unknown[]) => unknown).bind(value);
          lines.push(`${key}.${name} = __methods.${methodKey};`);
        }
      }
      proto = Object.getPrototypeOf(proto) as Record<string, unknown> | null;
    }
  }
  return { methods, preamble: lines.join("\n") };
}

export function runSandboxed(code: string, variables: Record<string, unknown>): unknown {
  const interpreter = new $t({
    ecmaVer: "latest",
    sourceType: "script",
    sandBox: true,
  });
  const { methods, preamble } = buildMethodInjections(variables);
  interpreter.import({ ...BLOCKED_GLOBALS, ...variables, __methods: methods });
  const fullCode = preamble + "\nexports.result = (function() { " + code + " })();";
  interpreter.run(fullCode);
  return interpreter.exports.result;
}

/**
 * Build a reusable sandboxed function from a code string.
 * Returns a function that accepts variables and runs the code.
 */
export function buildSandboxedFunction(
  code: string,
): (variables: Record<string, unknown>) => unknown {
  const wrappedBody = "exports.result = (function() { " + code + " })();";
  return (variables: Record<string, unknown>): unknown => {
    const interpreter = new $t({
      ecmaVer: "latest",
      sourceType: "script",
      sandBox: true,
    });
    const { methods, preamble } = buildMethodInjections(variables);
    interpreter.import({ ...BLOCKED_GLOBALS, ...variables, __methods: methods });
    interpreter.run(preamble + "\n" + wrappedBody);
    return interpreter.exports.result;
  };
}

/**
 * Evaluate a template expression in a sandboxed environment.
 * The code is a template literal body (no backticks).
 */
export function evalTemplate(template: string, variables: Record<string, unknown>): string {
  const interpreter = new $t({
    ecmaVer: "latest",
    sourceType: "script",
    sandBox: true,
  });
  // SVal reserves "self" (browser global), so remap it to _self and rewrite templates
  const vars = { ...BLOCKED_GLOBALS, ...variables };
  let processedTemplate = template;
  if ("self" in vars) {
    vars._self = vars.self;
    delete vars.self;
    processedTemplate = template.replace(/\bself\b/g, "_self");
  }
  interpreter.import(vars);
  interpreter.run("exports.result = `" + processedTemplate + "`;");
  const result = interpreter.exports.result;
  return typeof result === "string" ? result : String(result);
}
