import t from "tap";
import { evalTemplateSafe, TemplateEvalError } from "../src/core/template-eval.js";

function scope(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    self: { lit: true, location: "item:cage", open: false, locked: true, plantSize: "tiny" },
    entity: (id: string) => (id === "item:lamp" ? { name: "brass lamp", switchedOn: false } : {}),
    has: (tag: string) => tag === "portable",
    contents: () => ["bird", "moss"],
    ...over,
  };
}

t.test("real template expressions from the games", (t) => {
  t.equal(
    evalTemplateSafe("${self.lit ? 'A candle burns.' : 'An unlit candle.'}", scope()),
    "A candle burns.",
    "ternary on member access",
  );
  t.equal(
    evalTemplateSafe("${self.open ? 'open' : self.locked ? 'locked' : 'shut'}", scope()),
    "locked",
    "nested ternary",
  );
  t.equal(
    evalTemplateSafe(
      "${contents().length > 0 ? 'Cage (with ' + contents().join(', ') + ')' : 'Cage'}",
      scope(),
    ),
    "Cage (with bird, moss)",
    "call + .length + .join + concat",
  );
  t.equal(
    evalTemplateSafe("${self.location === 'item:cage' ? 'caged' : 'free'}", scope()),
    "caged",
    "=== comparison",
  );
  t.equal(evalTemplateSafe("plain text, no expr", scope()), "plain text, no expr", "literal passthrough");
  t.end();
});

t.test("the SVal escape is impossible — host realm unreachable", (t) => {
  t.throws(
    () => evalTemplateSafe("${({}).constructor}", scope()),
    TemplateEvalError,
    "constructor access blocked",
  );
  t.throws(
    () => evalTemplateSafe("${({}).constructor.constructor('return process')()}", scope()),
    TemplateEvalError,
    "Function-constructor escape blocked",
  );
  t.throws(
    () => evalTemplateSafe("${self.__proto__}", scope()),
    TemplateEvalError,
    "__proto__ blocked",
  );
  t.throws(
    () => evalTemplateSafe("${process}", scope()),
    TemplateEvalError,
    "unknown identifier (no host globals in scope)",
  );
  t.throws(
    () => evalTemplateSafe("${contents().constructor}", scope()),
    TemplateEvalError,
    "constructor on a returned array blocked",
  );
  t.throws(
    () => evalTemplateSafe("${[].join}", scope()),
    TemplateEvalError,
    "methods are not exposed as values, only invoked",
  );
  t.end();
});
