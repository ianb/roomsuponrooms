import { z } from "zod";
import * as jq from "jq-wasm";
import type { ToolContext } from "./agent-tool-context.js";
import {
  EntityNotFoundError,
  applyContainsFilter,
  runEntities,
  runEvents,
  runGet,
  runHandlers,
} from "./agent-query-runners.js";

const MAX_OUTPUT_BYTES = 10_000;

// --- Schema ---
//
// Flat single-object schema with `kind` as the discriminator. The four
// kinds form the minimal set: get a single entity (optionally extended with
// children/neighborhood), or fetch the bulk corpus of entities, handlers,
// or per-user events. Anything else (filter by tag, find by name, get
// contents, list rooms, etc.) is a jq filter over the bulk results.

const queryKindEnum = z.enum(["get", "entities", "handlers", "events"]);

export const queryInputSchema = z.object({
  kind: queryKindEnum.describe(
    [
      "Which query to run. Required.",
      "  - get: { id, withChildren?, withNeighborhood?, depth? } — fetch one entity by id.",
      "      withChildren: include direct contents (one level) as a children[] field.",
      "      withNeighborhood: include rooms reachable via this room's exits as a neighbors[] field.",
      "      depth: how far the neighborhood walks. 1 (default), 2, or 3.",
      "  - entities: {} — every entity in the world (with containedBy ancestor chain).",
      "  - handlers: {} — every registered verb handler with its pattern.",
      "  - events: {}   — the per-user player command log, oldest first.",
    ].join("\n"),
  ),
  id: z.string().optional().describe("Required by: get. The entity id to fetch."),
  withChildren: z
    .boolean()
    .optional()
    .describe("Optional for get: include the entity's direct contents as a children[] field."),
  withNeighborhood: z
    .boolean()
    .optional()
    .describe(
      "Optional for get: include rooms reachable via this entity's exits as a neighbors[] field. Only meaningful for rooms.",
    ),
  depth: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .describe("Optional for get with withNeighborhood: how many exit-hops to walk. Default 1."),
  contains: z
    .string()
    .optional()
    .describe(
      "Optional postprocess. Case-insensitive substring filter applied to the result. For an array result, keeps elements whose JSON-stringified form contains the substring. For a single object, keeps the object if its JSON contains the substring, else returns null.",
    ),
  jq: z
    .string()
    .optional()
    .describe(
      "Optional postprocess. A jq filter applied to the (possibly contains-filtered) result. Use this for tag filters, location lookups, projections, slicing, etc.",
    ),
  saveAs: z
    .string()
    .optional()
    .describe(
      "Optional postprocess. A name to save the (possibly filtered) result under in the session scratchpad for later get_var or jq calls.",
    ),
});

export type QueryInput = z.infer<typeof queryInputSchema>;

export interface QueryResult {
  ok: true;
  result: unknown;
  savedAs?: string;
}

export interface QueryError {
  ok: false;
  error: string;
}

class MissingFieldError extends Error {
  override name = "MissingFieldError";
  constructor(
    public readonly kind: string,
    public readonly fieldName: string,
  ) {
    super("Required field missing for query kind");
  }
}

// --- Dispatcher ---

export async function runQuery(
  context: ToolContext,
  input: QueryInput,
): Promise<QueryResult | QueryError> {
  let value: unknown;
  try {
    value = await dispatchQuery(context, input);
  } catch (e: unknown) {
    return { ok: false, error: formatRunnerError(e) };
  }

  if (input.contains !== undefined) {
    value = applyContainsFilter(value, input.contains);
  }

  if (input.jq) {
    try {
      value = await jq.json(JSON.stringify(value), input.jq);
    } catch (e: unknown) {
      const reason = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `jq filter failed: ${reason}` };
    }
  }

  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_OUTPUT_BYTES) {
    return {
      ok: false,
      error: `Result is ${serialized.length} bytes; max is ${MAX_OUTPUT_BYTES}. Use 'contains' for substring filtering or a 'jq' filter to project/slice the result.`,
    };
  }

  const result: QueryResult = { ok: true, result: value };
  if (input.saveAs) {
    context.savedVars[input.saveAs] = value;
    result.savedAs = input.saveAs;
  }
  return result;
}

function requireField<T>(value: T | undefined, where: { kind: string; field: string }): T {
  if (value === undefined) throw new MissingFieldError(where.kind, where.field);
  return value;
}

async function dispatchQuery(context: ToolContext, input: QueryInput): Promise<unknown> {
  switch (input.kind) {
    case "get":
      return runGet(context, {
        id: requireField(input.id, { kind: "get", field: "id" }),
        withChildren: input.withChildren,
        withNeighborhood: input.withNeighborhood,
        depth: input.depth,
      });
    case "entities":
      return runEntities(context);
    case "handlers":
      return runHandlers(context);
    case "events":
      return runEvents(context);
  }
}

function formatRunnerError(e: unknown): string {
  if (e instanceof MissingFieldError) {
    return `Query kind "${e.kind}" requires the "${e.fieldName}" field.`;
  }
  if (e instanceof EntityNotFoundError) return `Entity "${e.id}" does not exist.`;
  return e instanceof Error ? e.message : String(e);
}
