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

const queryKindSchema = z.union([
  z
    .object({ get: z.object({ id: z.string() }) })
    .describe('Fetch one entity by id. Example: {"get": {"id": "item:lantern"}}'),

  z
    .object({
      getRoom: z.object({
        id: z.string(),
        deep: z
          .boolean()
          .optional()
          .describe(
            "If true, contents are returned as full entity views instead of {id,name,tags} summaries. Default false.",
          ),
      }),
    })
    .describe(
      'Fetch a room with its exits (each resolved with destinationName) and contents nested inline. Example: {"getRoom": {"id": "room:gate"}}',
    ),

  z
    .object({
      getNeighborhood: z.object({
        id: z.string(),
        depth: z
          .number()
          .int()
          .min(1)
          .max(3)
          .optional()
          .describe("How many exit-hops out from the center room. Default 1."),
      }),
    })
    .describe(
      'Fetch a center room and adjacent rooms reachable via exits. Neighbors always use shallow contents. Example: {"getNeighborhood": {"id": "room:gate", "depth": 1}}',
    ),

  z
    .object({
      findByTag: z.object({
        tag: z.string(),
        at: z.string().optional().describe("Optional location id to scope the search to."),
        deep: z
          .boolean()
          .optional()
          .describe(
            "If true, return full entity views instead of {id,name,tags} summaries. Default false.",
          ),
      }),
    })
    .describe('Find entities by tag. Example: {"findByTag": {"tag": "room"}}'),

  z
    .object({
      findByName: z.object({
        query: z
          .string()
          .describe("Substring to match against name and aliases (case-insensitive)."),
        deep: z.boolean().optional(),
      }),
    })
    .describe(
      'Find entities whose name or alias contains a substring. Example: {"findByName": {"query": "lantern"}}',
    ),

  z
    .object({
      getContents: z.object({
        id: z.string(),
        deep: z.boolean().optional(),
      }),
    })
    .describe(
      'List contents of a location (one level deep). Example: {"getContents": {"id": "room:gate"}}',
    ),

  z
    .object({ listRooms: z.object({}) })
    .describe('List every room with its exits as a compact world map. Example: {"listRooms": {}}'),

  z
    .object({ listHandlers: z.object({}) })
    .describe(
      'List every registered verb handler with its pattern (no code bodies). Example: {"listHandlers": {}}',
    ),

  z
    .object({ getHandler: z.object({ name: z.string() }) })
    .describe(
      'Fetch one handler by its unique name. Example: {"getHandler": {"name": "ai-insert-lever-turnstile"}}',
    ),

  z
    .object({
      findEvents: z.object({
        latest: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(
            "Return only the most recent N event-log entries. Omit for all (paired with jq for slicing).",
          ),
      }),
    })
    .describe(
      'Read the per-user event log: player commands and the WorldEvents they generated. Example: {"findEvents": {"latest": 10}}',
    ),
]);

export const queryInputSchema = z.intersection(
  queryKindSchema,
  z.object({
    jq: z
      .string()
      .optional()
      .describe(
        "Optional jq filter applied to the result before returning. Use to project, slice, or filter large results in one call.",
      ),
    saveAs: z
      .string()
      .optional()
      .describe(
        "Optional name. If set, the (possibly jq-filtered) result is also saved under this name in the session scratchpad.",
      ),
  }),
);

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

class UnknownQueryKindError extends Error {
  override name = "UnknownQueryKindError";
  constructor() {
    super("Query input did not match any known kind");
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

  const postprocess = input as { jq?: string; saveAs?: string };
  if (postprocess.jq) {
    try {
      value = await jq.json(JSON.stringify(value), postprocess.jq);
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
  if (postprocess.saveAs) {
    context.savedVars[postprocess.saveAs] = value;
    result.savedAs = postprocess.saveAs;
  }
  return result;
}

async function dispatchQuery(context: ToolContext, input: QueryInput): Promise<unknown> {
  if ("get" in input) return runGet(context, input.get);
  if ("getRoom" in input) return runGetRoom(context, input.getRoom);
  if ("getNeighborhood" in input) return runGetNeighborhood(context, input.getNeighborhood);
  if ("findByTag" in input) return runFindByTag(context, input.findByTag);
  if ("findByName" in input) return runFindByName(context, input.findByName);
  if ("getContents" in input) return runGetContents(context, input.getContents);
  if ("listRooms" in input) return runListRooms(context);
  if ("listHandlers" in input) return runListHandlers(context);
  if ("getHandler" in input) return runGetHandler(context, input.getHandler);
  if ("findEvents" in input) return runFindEvents(context, input.findEvents);
  throw new UnknownQueryKindError();
}

function formatRunnerError(e: unknown): string {
  if (e instanceof EntityNotFoundError) return `Entity "${e.id}" does not exist.`;
  if (e instanceof RoomNotFoundError) return `Room "${e.id}" does not exist.`;
  if (e instanceof HandlerNotFoundError) return `Handler "${e.handlerName}" does not exist.`;
  if (e instanceof NotARoomError) return `Entity "${e.id}" is not tagged as a room.`;
  return e instanceof Error ? e.message : String(e);
}
