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
function prepareVars(variables: Record<string, unknown>): Record<string, unknown> {
  const prepared: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(variables)) {
    if (
      value !== null &&
      typeof value === "object" &&
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      const wrapper: Record<string, unknown> = {};
      // Walk prototype chain to collect all methods
      let proto = Object.getPrototypeOf(value) as Record<string, unknown> | null;
      while (proto && proto !== Object.prototype) {
        for (const name of Object.getOwnPropertyNames(proto)) {
          if (name === "constructor") continue;
          const desc = Object.getOwnPropertyDescriptor(proto, name);
          if (desc && typeof desc.value === "function") {
            wrapper[name] = (desc.value as (...args: unknown[]) => unknown).bind(value);
          }
        }
        proto = Object.getPrototypeOf(proto) as Record<string, unknown> | null;
      }
      // Own enumerable properties override prototype methods
      Object.assign(wrapper, value);
      prepared[key] = wrapper;
    } else {
      prepared[key] = value;
    }
  }
  return prepared;
}

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
  interpreter.import({ ...BLOCKED_GLOBALS, ...prepareVars(variables) });
  interpreter.run("exports.result = (function() { " + code + " })();");
  return interpreter.exports.result;
}

/**
 * Build a reusable sandboxed function from a code string.
 * Returns a function that accepts variables and runs the code.
 */
export function buildSandboxedFunction(
  code: string,
): (variables: Record<string, unknown>) => unknown {
  const wrappedCode = "exports.result = (function() { " + code + " })();";
  return (variables: Record<string, unknown>): unknown => {
    const interpreter = new $t({
      ecmaVer: "latest",
      sourceType: "script",
      sandBox: true,
    });
    interpreter.import({ ...BLOCKED_GLOBALS, ...prepareVars(variables) });
    interpreter.run(wrappedCode);
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
