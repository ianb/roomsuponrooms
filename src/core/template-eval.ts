import { parseExpressionAt } from "acorn";

/**
 * Safe evaluator for template `${...}` expressions.
 *
 * Replaces the SVal interpreter (which was escapable to host globals). We parse
 * with acorn — a pure-JS parser that never calls eval/Function, so it runs in
 * both Node and the Cloudflare Worker — then walk a strict whitelist of AST
 * node types ourselves. Because *we* perform every property access and call,
 * the `({}).constructor.constructor(...)` escape is impossible: there is no host
 * object reachable, and dangerous property names are blocked outright.
 *
 * Synchronous and side-effect-free, so it stays on the hot rendering path.
 */

export class TemplateEvalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateEvalError";
  }
}

interface Node {
  type: string;
  [key: string]: unknown;
}

const BLOCKED_PROPS = new Set(["constructor", "__proto__", "prototype"]);
// Methods callable on values (arrays/strings) — kept deliberately small.
const SAFE_METHODS = new Set([
  "join",
  "includes",
  "indexOf",
  "slice",
  "concat",
  "split",
  "trim",
  "toUpperCase",
  "toLowerCase",
  "filter",
  "map",
  "find",
  "some",
  "every",
]);

const astCache = new Map<string, Node>();

type Scope = Record<string, unknown>;

function asNode(value: unknown): Node {
  return value as Node;
}

function propName(node: Node, scope: Scope): string {
  if (node.computed) {
    const key = evalNode(asNode(node.property), scope);
    return typeof key === "string" ? key : String(key);
  }
  return asNode(node.property).name as string;
}

function getMember(obj: unknown, key: string): unknown {
  if (BLOCKED_PROPS.has(key)) throw new TemplateEvalError("blocked property: " + key);
  if (obj === null || obj === undefined) {
    throw new TemplateEvalError("cannot read '" + key + "' of null/undefined");
  }
  const value = (obj as Record<string, unknown>)[key];
  if (typeof value === "function") {
    // Functions are never exposed as values (only invoked via CallExpression).
    throw new TemplateEvalError("property is not readable: " + key);
  }
  return value;
}

function callMethod(obj: unknown, { method, args }: { method: string; args: unknown[] }): unknown {
  if (!SAFE_METHODS.has(method)) throw new TemplateEvalError("method not allowed: " + method);
  if (obj === null || obj === undefined) {
    throw new TemplateEvalError("cannot call '" + method + "' of null");
  }
  const fn = (obj as Record<string, unknown>)[method];
  if (typeof fn !== "function") throw new TemplateEvalError("not a method: " + method);
  return (fn as (...a: unknown[]) => unknown).apply(obj, args);
}

function binary(op: string, { left, right }: { left: unknown; right: unknown }): unknown {
  const l = left as number;
  const r = right as number;
  switch (op) {
    case "+":
      return (left as number) + (right as number);
    case "-":
      return l - r;
    case "*":
      return l * r;
    case "/":
      return l / r;
    case "%":
      return l % r;
    case "===":
      return left === right;
    case "!==":
      return left !== right;
    case "==":
      return left == right;
    case "!=":
      return left != right;
    case ">":
      return l > r;
    case "<":
      return l < r;
    case ">=":
      return l >= r;
    case "<=":
      return l <= r;
    default:
      throw new TemplateEvalError("operator not allowed: " + op);
  }
}

function evalArgs(node: Node, scope: Scope): unknown[] {
  return (node.arguments as Node[]).map((a) => evalNode(a, scope));
}

function evalCall(node: Node, scope: Scope): unknown {
  const callee = asNode(node.callee);
  if (callee.type === "Identifier") {
    const name = callee.name as string;
    const fn = scope[name];
    if (typeof fn !== "function") throw new TemplateEvalError("not callable: " + name);
    return (fn as (...a: unknown[]) => unknown)(...evalArgs(node, scope));
  }
  if (callee.type === "MemberExpression") {
    const obj = evalNode(asNode(callee.object), scope);
    return callMethod(obj, { method: propName(callee, scope), args: evalArgs(node, scope) });
  }
  throw new TemplateEvalError("unsupported call target: " + callee.type);
}

function evalLogical(node: Node, scope: Scope): unknown {
  const op = node.operator as string;
  const left = evalNode(asNode(node.left), scope);
  if (op === "&&") return left ? evalNode(asNode(node.right), scope) : left;
  if (op === "||") return left ? left : evalNode(asNode(node.right), scope);
  if (op === "??") {
    return left === null || left === undefined ? evalNode(asNode(node.right), scope) : left;
  }
  throw new TemplateEvalError("operator not allowed: " + op);
}

function evalUnary(node: Node, scope: Scope): unknown {
  const arg = evalNode(asNode(node.argument), scope);
  switch (node.operator) {
    case "!":
      return !arg;
    case "-":
      return -(arg as number);
    case "+":
      return +(arg as number);
    case "typeof":
      return typeof arg;
    default:
      throw new TemplateEvalError("unary operator not allowed: " + String(node.operator));
  }
}

function evalTemplateLiteral(node: Node, scope: Scope): string {
  const quasis = node.quasis as Node[];
  const exprs = node.expressions as Node[];
  let out = "";
  for (const [i, quasi] of quasis.entries()) {
    const cooked = (quasi.value as { cooked?: string }).cooked;
    out += cooked === undefined ? "" : cooked;
    const expr = exprs[i];
    if (expr) {
      const v = evalNode(expr, scope);
      out += v === undefined || v === null ? "" : String(v);
    }
  }
  return out;
}

function evalNode(node: Node, scope: Scope): unknown {
  switch (node.type) {
    case "TemplateLiteral":
      return evalTemplateLiteral(node, scope);
    case "Literal":
      return node.value;
    case "Identifier": {
      const name = node.name as string;
      if (!(name in scope)) throw new TemplateEvalError("unknown identifier: " + name);
      return scope[name];
    }
    case "MemberExpression":
      return getMember(evalNode(asNode(node.object), scope), propName(node, scope));
    case "CallExpression":
      return evalCall(node, scope);
    case "ConditionalExpression":
      return evalNode(asNode(node.test), scope)
        ? evalNode(asNode(node.consequent), scope)
        : evalNode(asNode(node.alternate), scope);
    case "BinaryExpression":
      return binary(node.operator as string, {
        left: evalNode(asNode(node.left), scope),
        right: evalNode(asNode(node.right), scope),
      });
    case "LogicalExpression":
      return evalLogical(node, scope);
    case "UnaryExpression":
      return evalUnary(node, scope);
    case "ArrayExpression":
      return (node.elements as Node[]).map((e) => (e === null ? null : evalNode(e, scope)));
    default:
      throw new TemplateEvalError("unsupported expression: " + node.type);
  }
}

/**
 * Render a template literal body (no backticks) with `${...}` expressions,
 * evaluated against `scope`. Mirrors the old evalTemplate contract.
 */
export function evalTemplateSafe(template: string, scope: Scope): string {
  let ast = astCache.get(template);
  if (!ast) {
    // Parse the whole thing as a template literal so acorn handles ${} and escapes.
    ast = asNode(parseExpressionAt("`" + template + "`", 0, { ecmaVersion: 2022 }));
    astCache.set(template, ast);
  }
  const result = evalNode(ast, scope);
  return typeof result === "string" ? result : String(result);
}
