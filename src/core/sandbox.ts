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
 * Flatten prototype methods onto class instances so sval can see them.
 * sval's sandbox doesn't preserve prototype chains, so inherited methods
 * like lib.tryGet() would be invisible without this.
 */
/**
 * Ensure class instances have prototype methods as own properties so
 * sval can see them. Modifies the instance in place.
 */
function flattenPrototypeMethods(obj: Record<string, unknown>): void {
  let proto = Object.getPrototypeOf(obj) as Record<string, unknown> | null;
  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === "constructor") continue;
      if (name in obj) continue; // don't override own properties
      const desc = Object.getOwnPropertyDescriptor(proto, name);
      if (desc && typeof desc.value === "function") {
        obj[name] = (desc.value as (...args: unknown[]) => unknown).bind(obj);
      }
    }
    proto = Object.getPrototypeOf(proto) as Record<string, unknown> | null;
  }
}

function flattenForSandbox(variables: Record<string, unknown>): Record<string, unknown> {
  for (const value of Object.values(variables)) {
    if (value !== null && typeof value === "object") {
      flattenPrototypeMethods(value as Record<string, unknown>);
    }
  }
  return variables;
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
  interpreter.import({ ...BLOCKED_GLOBALS, ...flattenForSandbox(variables) });
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
    interpreter.import({ ...BLOCKED_GLOBALS, ...flattenForSandbox(variables) });
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
