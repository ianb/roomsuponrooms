import t from "tap";
import { validateHandlerCode } from "../src/server/handler-code-validate.js";
import type { HandlerData } from "../src/core/game-data.js";

function payload(fields: Partial<HandlerData>): Partial<HandlerData> {
  return { ...fields };
}

void t.test("valid code passes untouched", async (t) => {
  const p = payload({ perform: "return { output: 'Done.', events: [] };" });
  const result = validateHandlerCode(p, { name: "h", form: "transitive" });
  t.equal(result.error, null);
  t.same(result.notes, []);
  t.equal(p.perform, "return { output: 'Done.', events: [] };");
});

void t.test("plain syntax error is rejected with the parser message", async (t) => {
  const p = payload({ perform: "return { output: 'Done." });
  const result = validateHandlerCode(p, { name: "h", form: "transitive" });
  t.ok(result.error);
  t.match(result.error, /syntax error/);
});

void t.test("over-escaped code is auto-repaired in place", async (t) => {
  // Literal backslash-n between statements and \\" quotes — the classic
  // double-escape a model produces inside a JSON tool call.
  const broken = 'const x = 1;\\nreturn { output: \\"He says \\\\\\"hi\\\\\\".\\", events: [] };';
  const p = payload({ perform: broken });
  const result = validateHandlerCode(p, { name: "h", form: "transitive" });
  t.equal(result.error, null);
  t.equal(result.notes.length, 1);
  t.match(result.notes[0], /auto-repaired/);
  t.not(p.perform, broken);
  t.match(p.perform, /\n/, "escaped newline became a real newline");
});

void t.test("unrepairable code reports error with hint", async (t) => {
  const p = payload({ perform: "retrun { output: 'typo' };" });
  const result = validateHandlerCode(p, { name: "h", form: "transitive" });
  t.ok(result.error);
  t.match(result.error, /Hint/);
});

void t.test("indirect reference on non-ditransitive form is rejected", async (t) => {
  const p = payload({
    perform: "if (indirect.id === 'item:lock') return { output: 'ok', events: [] };",
  });
  const result = validateHandlerCode(p, { name: "h", form: "prepositional" });
  t.ok(result.error);
  t.match(result.error, /ditransitive/);
});

void t.test("indirect reference on ditransitive form is fine", async (t) => {
  const p = payload({
    perform: "if (indirect.id === 'item:lock') return { output: 'ok', events: [] };",
  });
  const result = validateHandlerCode(p, { name: "h", form: "ditransitive" });
  t.equal(result.error, null);
});

void t.test("check and veto fields are validated too", async (t) => {
  const p = payload({ check: "return object.id ===", perform: "return { output: 'x' };" });
  const result = validateHandlerCode(p, { name: "h", form: "transitive" });
  t.ok(result.error);
  t.match(result.error, /check/);
});
