import type { VerbHandler } from "../core/verb-types.js";
import type { AiHandlerRecord } from "./storage.js";
import { handlerDataToHandler } from "../core/handler-eval.js";

/** Convert a stored handler record to a live VerbHandler */
export function recordToHandler(record: AiHandlerRecord): VerbHandler {
  const handler = handlerDataToHandler(record);
  handler.source = "ai-handler-store";
  return handler;
}
