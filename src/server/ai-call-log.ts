import { getStorage } from "./storage-instance.js";
import type { AiCallRecord } from "./storage.js";

/**
 * Persistent log of server-side LLM calls, so that when AI-generated content
 * looks wrong you can retrieve the exact prompt and response that produced
 * it. The entity store records an aiCallId on each AI-authored entity; this
 * module is the other half — it writes the record that id points to.
 *
 * Logging is best-effort: if the storage backend doesn't implement logAiCall
 * (e.g. tests with a mock store), or if persistence fails, we log to the
 * console and continue. We do NOT throw from the logging path — AI call
 * logging must never break the user-visible creation flow.
 */

/** Generate a new AI call id. Not cryptographically random — just enough
 *  entropy to avoid collisions within the retention window. */
export function newAiCallId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `aic-${t}-${r}`;
}

/**
 * Persist an AI call record. Best-effort — swallows storage errors after
 * logging them to the console, so call sites can use this in a `finally`
 * block without worrying about a secondary failure masking the primary one.
 */
export async function logAiCall(record: AiCallRecord): Promise<void> {
  const storage = getStorage();
  if (!storage.logAiCall) return;
  try {
    await storage.logAiCall(record);
  } catch (err: unknown) {
    console.error("[ai-call-log] Failed to persist AI call:", err);
  }
}

/**
 * Run a function that makes an LLM call, capturing its prompt and response
 * to the AI call log whether or not the call succeeds. The returned object
 * contains the (typed) result and the generated call id, which callers
 * stamp onto authoring metadata so broken entities can be traced back to
 * their originating prompt. Errors are re-thrown after logging.
 */
export async function runLoggedAiCall<T>(
  meta: Omit<
    AiCallRecord,
    "id" | "timestamp" | "response" | "durationMs" | "error" | "tokensIn" | "tokensOut"
  >,
  fn: () => Promise<T>,
): Promise<{ result: T; callId: string }> {
  const callId = newAiCallId();
  const startTime = Date.now();
  let response: unknown;
  let errorMsg: string | undefined;
  let tokensIn: number | undefined;
  let tokensOut: number | undefined;
  try {
    const result = await fn();
    response = result;
    // Duck-type the AI SDK result to extract token usage when available.
    const usage = (result as { usage?: { promptTokens?: number; completionTokens?: number } })
      .usage;
    if (usage) {
      tokensIn = usage.promptTokens;
      tokensOut = usage.completionTokens;
    }
    return { result, callId };
  } catch (err: unknown) {
    errorMsg = err instanceof Error ? err.message : String(err);
    throw err as Error;
  } finally {
    await logAiCall({
      ...meta,
      id: callId,
      timestamp: new Date().toISOString(),
      response,
      durationMs: Date.now() - startTime,
      tokensIn,
      tokensOut,
      error: errorMsg,
    });
  }
}
