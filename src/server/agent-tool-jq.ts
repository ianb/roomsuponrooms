import { z } from "zod";
import * as jq from "jq-wasm";
import type { ToolContext } from "./agent-tool-context.js";

const MAX_INPUT_BYTES = 100_000;
const MAX_OUTPUT_BYTES = 10_000;

export const jqInputSchema = z.object({
  /** Either inline JSON value or {var: name} to read from saved scratch. */
  source: z.union([z.object({ json: z.unknown() }), z.object({ var: z.string() })]),
  /** A jq filter expression. */
  filter: z.string(),
});

export type JqInput = z.infer<typeof jqInputSchema>;

export interface JqResult {
  ok: true;
  result: unknown;
  truncated: boolean;
}

export interface JqError {
  ok: false;
  error: string;
}

class JqVarNotFoundError extends Error {
  override name = "JqVarNotFoundError";
  constructor(name: string) {
    super(`No saved variable named '${name}'.`);
  }
}

export async function runJq(context: ToolContext, input: JqInput): Promise<JqResult | JqError> {
  let value: unknown;
  if ("json" in input.source) {
    value = input.source.json;
  } else {
    if (!(input.source.var in context.savedVars)) {
      return { ok: false, error: new JqVarNotFoundError(input.source.var).message };
    }
    value = context.savedVars[input.source.var];
  }

  const inputJson = JSON.stringify(value);
  if (inputJson.length > MAX_INPUT_BYTES) {
    return {
      ok: false,
      error: `Input JSON is ${inputJson.length} bytes; max is ${MAX_INPUT_BYTES}.`,
    };
  }

  let result: unknown;
  try {
    result = await jq.json(inputJson, input.filter);
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const serialized = JSON.stringify(result);
  const truncated = serialized.length > MAX_OUTPUT_BYTES;
  if (truncated) {
    return {
      ok: false,
      error: `Result is ${serialized.length} bytes; max is ${MAX_OUTPUT_BYTES}. Use a tighter filter or save_var + paginate.`,
    };
  }
  return { ok: true, result, truncated: false };
}
