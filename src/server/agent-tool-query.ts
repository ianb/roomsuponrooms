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

const queryKindEnum = z.enum(["get", "entities", "handlers", "events", "var"]);

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
      "  - var: { name } — read a previously-saved scratchpad variable. Combine with contains/jq/limit to slice it without re-running the original query.",
    ].join("\n"),
  ),
  id: z.string().optional().describe("Required by: get. The entity id to fetch."),
  name: z
    .string()
    .optional()
    .describe("Required by: var. The saved variable name to read from the scratchpad."),
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
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Optional postprocess. For array results, return only the first N items (default 5). The full count is reported as totalMatched and the number dropped as omittedCount. Pass a larger value if you genuinely want more — but the size cap may still kick in.",
    ),
  saveAs: z
    .string()
    .optional()
    .describe(
      "Optional postprocess. A name to save the (possibly filtered) result under in the session scratchpad. When set, the response does NOT echo the value back — it returns just savedAs + a brief summary (count or shape). Read the saved value later with query({kind:'var', name:'...'}). The scratchpad gets the FULL untruncated result regardless of any limit.",
    ),
});

export type QueryInput = z.infer<typeof queryInputSchema>;

export interface QueryResult {
  ok: true;
  /**
   * The query result. Omitted when `saveAs` is set — the value is in the
   * scratchpad and the caller can read it back via `kind:"var"`. Suppressing
   * the echo keeps the conversation small when the agent is just stashing a
   * big result for later filtering.
   */
  result?: unknown;
  /** For truncated array results: the full count before paging. */
  totalMatched?: number;
  /** For truncated array results: the number of items dropped. */
  omittedCount?: number;
  /** For truncated single-object results: a hint that the result was clipped. */
  truncated?: boolean;
  savedAs?: string;
  /**
   * One-line shape summary for saved values, so the agent has some
   * confidence in what was stashed without seeing the bytes. Set only when
   * saveAs is set.
   */
  savedSummary?: string;
  /** Hint string included on truncated/oversized results explaining what to do. */
  hint?: string;
}

const DEFAULT_LIMIT = 5;

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

  // Save the FULL pre-truncation value to the scratchpad if requested. The
  // scratchpad never sees the trimmed sample so the agent can read it back
  // later via query({kind:"var", name:"..."}) and feed it through jq for
  // further filtering.
  let savedAs: string | undefined;
  let savedSummary: string | undefined;
  if (input.saveAs) {
    context.savedVars[input.saveAs] = value;
    savedAs = input.saveAs;
    savedSummary = summarizeForSave(value);
  }

  // When the caller asked us to save the value, suppress the echo entirely:
  // they get back a confirmation + summary, not a duplicate of the bytes.
  // The agent reads the saved value later via kind:"var".
  if (savedAs !== undefined) {
    const result: QueryResult = { ok: true, savedAs };
    if (savedSummary) result.savedSummary = savedSummary;
    if (Array.isArray(value)) result.totalMatched = value.length;
    result.hint =
      `Saved to scratchpad as "${savedAs}". Read it back with ` +
      `query({kind:"var", name:"${savedAs}"}); ` +
      "slice or filter via the same call's contains/jq/limit fields, " +
      `e.g. query({kind:"var", name:"${savedAs}", jq:"[.[] | select(.tag == \\"foo\\")]", limit: 10}).`;
    return result;
  }

  // Trim top-level arrays to the requested limit (default 5) so big result
  // sets always come back as a manageable sample with omittedCount metadata.
  const limit = input.limit || DEFAULT_LIMIT;
  let totalMatched: number | undefined;
  let omittedCount: number | undefined;
  if (Array.isArray(value)) {
    totalMatched = value.length;
    if (totalMatched > limit) {
      value = value.slice(0, limit);
      omittedCount = totalMatched - limit;
    }
  }

  // After trimming, check the size cap. If still oversized (e.g. one item is
  // huge), keep slicing the array down so the agent at least sees a taste.
  // For non-array values that overflow, return an error pointing at the
  // available knobs.
  let serialized = JSON.stringify(value);
  if (serialized.length > MAX_OUTPUT_BYTES) {
    if (Array.isArray(value)) {
      const trimmed = trimArrayToFit(value, MAX_OUTPUT_BYTES);
      if (trimmed.items.length === 0) {
        return {
          ok: false,
          error: `Even one item exceeds the ${MAX_OUTPUT_BYTES}-byte cap. Use a 'jq' filter to project just the fields you need.`,
        };
      }
      const dropped = value.length - trimmed.items.length;
      omittedCount = (omittedCount || 0) + dropped;
      value = trimmed.items;
      serialized = trimmed.serialized;
    } else {
      return {
        ok: false,
        error: `Result is ${serialized.length} bytes; max is ${MAX_OUTPUT_BYTES}. Use 'contains' for substring filtering or a 'jq' filter to project/slice the result.`,
      };
    }
  }

  const result: QueryResult = { ok: true, result: value };
  if (totalMatched !== undefined) result.totalMatched = totalMatched;
  if (omittedCount !== undefined && omittedCount > 0) {
    result.omittedCount = omittedCount;
    result.hint = `${omittedCount} item${omittedCount === 1 ? "" : "s"} omitted (showing ${
      Array.isArray(value) ? value.length : 0
    } of ${totalMatched}). Pass 'limit' for more, 'contains' or 'jq' to filter, or 'saveAs' to capture the full set in the scratchpad.`;
  }
  return result;
}

/**
 * Build a one-line description of a value the agent just stashed in the
 * scratchpad — type and approximate size, no contents. The agent can re-read
 * the actual data via kind:"var" if it needs more.
 */
function summarizeForSave(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array of ${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") {
    const keys = Object.keys(value as object);
    return `object with ${keys.length} key${keys.length === 1 ? "" : "s"}${
      keys.length > 0 && keys.length <= 6 ? `: ${keys.join(", ")}` : ""
    }`;
  }
  if (typeof value === "string") return `string (${value.length} chars)`;
  return typeof value;
}

/** Slice an array down until its serialized form fits within `maxBytes`. */
function trimArrayToFit(
  items: unknown[],
  maxBytes: number,
): { items: unknown[]; serialized: string } {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = items.slice(0, mid);
    const json = JSON.stringify(candidate);
    if (json.length <= maxBytes) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  const finalItems = items.slice(0, lo);
  return { items: finalItems, serialized: JSON.stringify(finalItems) };
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
    case "var": {
      const name = requireField(input.name, { kind: "var", field: "name" });
      if (!(name in context.savedVars)) {
        throw new SavedVarNotFoundError(name);
      }
      return context.savedVars[name];
    }
  }
}

class SavedVarNotFoundError extends Error {
  override name = "SavedVarNotFoundError";
  constructor(public readonly varName: string) {
    super(`No saved variable named "${varName}".`);
  }
}

function formatRunnerError(e: unknown): string {
  if (e instanceof MissingFieldError) {
    return `Query kind "${e.kind}" requires the "${e.fieldName}" field.`;
  }
  if (e instanceof EntityNotFoundError) return `Entity "${e.id}" does not exist.`;
  if (e instanceof SavedVarNotFoundError) return e.message;
  return e instanceof Error ? e.message : String(e);
}
