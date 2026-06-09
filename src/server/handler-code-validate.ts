import { parse } from "acorn";
import type { HandlerData } from "../core/game-data.js";

/**
 * Syntax-validate (and where possible auto-repair) the JS code bodies on a
 * handler edit payload BEFORE the edit is accepted.
 *
 * Without this, a handler with a syntax error sails through apply_edits,
 * then throws at dispatch time inside playtest — where the registry's
 * self-healing removes it and the agent just sees outcome:"unhandled" with
 * no explanation. Models (especially cheaper ones) routinely double-escape
 * code embedded in JSON tool calls (writing literal \n and \" sequences into
 * the source), so we try decoding one escape level before rejecting.
 */

const CODE_FIELDS = ["check", "veto", "perform"] as const;
type CodeField = (typeof CODE_FIELDS)[number];

/** Parse a code body the same way the sandbox wraps it. Returns the syntax
 *  error message, or null if the code parses. */
function syntaxError(code: string): string | null {
  try {
    parse(`(function() { ${code} })`, { ecmaVersion: "latest" });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  '"': '"',
  "'": "'",
  "`": "`",
  "\\": "\\",
};

/** Decode one level of string escaping (\\n → newline, \\" → ", etc.). */
function unescapeOneLevel(code: string): string {
  return code.replace(/\\(["'\\`nrt])/g, (_match, c: string) => {
    const decoded = ESCAPES[c];
    return decoded === undefined ? `\\${c}` : decoded;
  });
}

export interface HandlerCodeCheck {
  /** Rejection reason, or null if every code field is (now) valid. */
  error: string | null;
  /** Notes about auto-repairs performed (payload was mutated in place). */
  notes: string[];
}

/**
 * Validate the code fields of a handler create/update payload. MUTATES the
 * payload in place when an over-escaped body can be repaired by decoding one
 * escape level. `form` is the effective pattern form (from the payload or
 * the existing handler), used to reject code that references `indirect` on
 * forms that never bind an indirect object.
 */
export function validateHandlerCode(
  payload: Partial<HandlerData>,
  { name, form }: { name: string; form: string | undefined },
): HandlerCodeCheck {
  const notes: string[] = [];
  for (const field of CODE_FIELDS) {
    const code = payload[field];
    if (typeof code !== "string") continue;
    const err = syntaxError(code);
    if (err) {
      const repaired = unescapeOneLevel(code);
      if (repaired !== code && syntaxError(repaired) === null) {
        (payload as Record<CodeField, string>)[field] = repaired;
        notes.push(
          `Handler "${name}" ${field}: code contained over-escaped sequences (e.g. literal \\n); ` +
            "auto-repaired by decoding one escape level. Use single escaping in JSON strings.",
        );
        continue;
      }
      return {
        error:
          `Handler "${name}" ${field} code has a JavaScript syntax error: ${err}. ` +
          'Hint: if the code contains literal \\n or \\" sequences, it was double-escaped — ' +
          "JSON strings need only ONE level of escaping.",
        notes,
      };
    }
  }

  if (form && form !== "ditransitive") {
    for (const field of CODE_FIELDS) {
      const code = payload[field];
      if (typeof code === "string" && /\bindirect\b/.test(code)) {
        return {
          error:
            `Handler "${name}" ${field} code references \`indirect\`, but its form is ` +
            `"${form}" — only ditransitive commands ("put X in Y") bind an indirect object; ` +
            `with form "${form}" \`indirect\` is undefined and the code will throw. ` +
            'Use form: "ditransitive" for two-noun commands, or drop the indirect reference.',
          notes,
        };
      }
    }
  }

  return { error: null, notes };
}
