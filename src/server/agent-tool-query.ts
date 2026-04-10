import { z } from "zod";
import * as jq from "jq-wasm";
import type { ToolContext } from "./agent-tool-context.js";
import {
  EntityNotFoundError,
  HandlerNotFoundError,
  NotARoomError,
  RoomNotFoundError,
  runFindByName,
  runFindByTag,
  runFindEvents,
  runGet,
  runGetContents,
  runGetHandler,
  runGetNeighborhood,
  runGetRoom,
  runListHandlers,
  runListRooms,
} from "./agent-query-runners.js";

const MAX_OUTPUT_BYTES = 10_000;

// --- Schema ---
//
// Flat single-object schema with `kind` as the discriminator and per-kind
// fields as optional siblings. Earlier we used a per-kind-key discriminated
// union (`{getRoom: {id, deep}}`), but Google's Gemini Flash strips
// `anyOf`/`oneOf` from tool schemas and ends up sending an empty `{}` over
// and over. The flat schema sidesteps that — the model picks a `kind` enum
// value and fills in whichever sibling fields the kind needs. Required-field
// validation runs at runtime in dispatchQuery.

const queryKindEnum = z.enum([
  "get",
  "getRoom",
  "getNeighborhood",
  "findByTag",
  "findByName",
  "getContents",
  "listRooms",
  "listHandlers",
  "getHandler",
  "findEvents",
]);

export const queryInputSchema = z.object({
  kind: queryKindEnum.describe(
    [
      "Which query to run. Required. Each kind needs a different combination of",
      "the optional fields below:",
      "  - get: { id }                — fetch one entity by id",
      "  - getRoom: { id, deep? }     — room with nested exits and contents",
      "  - getNeighborhood: { id, depth? } — center room + adjacent rooms",
      "  - findByTag: { tag, at?, deep? } — entities by tag, optional location scope",
      "  - findByName: { name, deep? } — substring search on entity name and aliases",
      "  - getContents: { id, deep? } — single-level contents of any location",
      "  - listRooms: {}              — every room with its exits",
      "  - listHandlers: {}           — every registered verb handler",
      "  - getHandler: { name }       — one handler by exact name",
      "  - findEvents: { latest? }    — per-user player command log",
    ].join("\n"),
  ),
  id: z
    .string()
    .optional()
    .describe("The entity id to fetch. Required by: get, getRoom, getNeighborhood, getContents."),
  tag: z.string().optional().describe("The tag to match. Required by: findByTag."),
  at: z
    .string()
    .optional()
    .describe("Optional for findByTag: a location id to scope the search to."),
  name: z
    .string()
    .optional()
    .describe(
      "For findByName: a substring matched (case-insensitive) against entity name and aliases. For getHandler: the exact handler name.",
    ),
  depth: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .describe(
      "Optional for getNeighborhood: how many exit-hops out from the center room. Default 1.",
    ),
  deep: z
    .boolean()
    .optional()
    .describe(
      "Optional for getRoom/getContents/findByTag/findByName: if true, return full entity views instead of {id,name,tags} summaries. Default false.",
    ),
  latest: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Optional for findEvents: return only the most recent N event-log entries. Omit for all (paired with jq for slicing).",
    ),
  jq: z
    .string()
    .optional()
    .describe(
      "Optional jq filter applied to the result before returning. Use this to project, slice, or filter large results in one call.",
    ),
  saveAs: z
    .string()
    .optional()
    .describe(
      "Optional name. If set, the (possibly jq-filtered) result is also saved under this name in the session scratchpad for later get_var or jq calls.",
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
      error: `Result is ${serialized.length} bytes; max is ${MAX_OUTPUT_BYTES}. Use a tighter query, deep:false, or an inline jq filter to project/slice the result.`,
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
      });
    case "getRoom":
      return runGetRoom(context, {
        id: requireField(input.id, { kind: "getRoom", field: "id" }),
        deep: input.deep,
      });
    case "getNeighborhood":
      return runGetNeighborhood(context, {
        id: requireField(input.id, { kind: "getNeighborhood", field: "id" }),
        depth: input.depth,
      });
    case "findByTag":
      return runFindByTag(context, {
        tag: requireField(input.tag, { kind: "findByTag", field: "tag" }),
        at: input.at,
        deep: input.deep,
      });
    case "findByName":
      return runFindByName(context, {
        query: requireField(input.name, { kind: "findByName", field: "name" }),
        deep: input.deep,
      });
    case "getContents":
      return runGetContents(context, {
        id: requireField(input.id, { kind: "getContents", field: "id" }),
        deep: input.deep,
      });
    case "listRooms":
      return runListRooms(context);
    case "listHandlers":
      return runListHandlers(context);
    case "getHandler":
      return runGetHandler(context, {
        name: requireField(input.name, { kind: "getHandler", field: "name" }),
      });
    case "findEvents":
      return runFindEvents(context, { latest: input.latest });
  }
}

function formatRunnerError(e: unknown): string {
  if (e instanceof MissingFieldError) {
    return `Query kind "${e.kind}" requires the "${e.fieldName}" field.`;
  }
  if (e instanceof EntityNotFoundError) return `Entity "${e.id}" does not exist.`;
  if (e instanceof RoomNotFoundError) return `Room "${e.id}" does not exist.`;
  if (e instanceof HandlerNotFoundError) return `Handler "${e.handlerName}" does not exist.`;
  if (e instanceof NotARoomError) return `Entity "${e.id}" is not tagged as a room.`;
  return e instanceof Error ? e.message : String(e);
}
