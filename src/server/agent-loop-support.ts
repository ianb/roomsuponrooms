import { InvalidToolInputError, APICallError, RetryError } from "ai";
import type { ModelMessage } from "ai";
import type { LanguageModelV3ToolCall } from "@ai-sdk/provider";

/**
 * Support helpers for the agent loop: tool-call repair, stall detection,
 * history scans for the tool guards, rate-limit classification, and progress
 * summaries. Split from agent-loop.ts for file-size reasons.
 */

export /**
 * Repair a tool call whose arguments arrived as a JSON-encoded STRING instead
 * of an object — i.e. the model wrapped its argument object in one extra
 * layer of JSON encoding (observed with kimi-k2; a common weak-model tic).
 * Unwrapping one level turns `"{\"edits\":...}"` back into `{"edits":...}`.
 * Returns null (no repair) for anything else.
 */
async function repairDoubleEncodedToolCall({
  toolCall,
  error,
}: {
  toolCall: LanguageModelV3ToolCall;
  error: unknown;
}): Promise<LanguageModelV3ToolCall | null> {
  if (!InvalidToolInputError.isInstance(error)) return null;
  try {
    const once: unknown = JSON.parse(toolCall.input);
    if (typeof once !== "string") return null;
    const twice: unknown = JSON.parse(once);
    if (twice === null || typeof twice !== "object") return null;
    console.log(`[agent] repaired double-encoded arguments for tool ${toolCall.toolName}`);
    return { ...toolCall, input: once };
  } catch (_e) {
    return null;
  }
}

export const NUDGE =
  "Respond ONLY with tool calls. If the work is complete and playtested, call " +
  "finish(summary); if you are stuck, call bail(reason). Otherwise keep working " +
  "with the tools.";

/**
 * If the model ended its response with no tool call (text-only or entirely
 * empty), the next tick would replay the identical context and stall the
 * same way — nudge it. But repeated empty responses mean something
 * structural is wrong (e.g. the provider cannot handle a tool schema), so
 * after two prior nudges, give up instead of burning the turn limit.
 */
export function stallDisposition(
  steps: Array<{ toolCalls: unknown[] }>,
  { terminated, priorMessages }: { terminated: boolean; priorMessages: unknown[] },
): "nudge" | "give-up" | null {
  if (terminated) return null;
  const lastStep = steps.at(-1);
  if (!lastStep || lastStep.toolCalls.length > 0) return null;
  const priorNudges = (priorMessages as Array<{ role?: string; content?: unknown }>).filter(
    (m) => m.role === "user" && m.content === NUDGE,
  ).length;
  return priorNudges >= 2 ? "give-up" : "nudge";
}

export /**
 * Did the conversation apply edits more recently than it ran a playtest?
 * Used to re-initialize ToolContext.editsSinceLastPlaytest when a session
 * resumes on a new tick.
 */
function hasEditsSinceLastPlaytest(messages: ModelMessage[]): boolean {
  let lastEdit = -1;
  let lastPlaytest = -1;
  for (const [i, m] of messages.entries()) {
    if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
    for (const part of m.content) {
      const p = part as { type?: string; toolName?: string };
      if (p.type !== "tool-call") continue;
      if (p.toolName === "apply_edits") lastEdit = i;
      if (p.toolName === "playtest") lastPlaytest = i;
    }
  }
  return lastEdit > lastPlaytest;
}

export /** Has any query tool call happened in the conversation so far? */
function hasQueriedWorld(messages: ModelMessage[]): boolean {
  for (const m of messages) {
    if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
    for (const part of m.content) {
      const p = part as { type?: string; toolName?: string };
      if (p.type === "tool-call" && p.toolName === "query") return true;
    }
  }
  return false;
}

export /**
 * Is this a rate-limit / transient provider error that the caller should
 * back off and retry, rather than a real failure? The SDK wraps the last
 * error in a RetryError after its own retries are exhausted.
 */
function isRateLimitError(e: unknown): boolean {
  const candidate = RetryError.isInstance(e) ? e.lastError : e;
  if (APICallError.isInstance(candidate)) {
    return candidate.statusCode === 429 || candidate.isRetryable === true;
  }
  return false;
}

export function summarizeToolCall(name: string, input: unknown): string {
  if (input === null || typeof input !== "object") return name;
  const obj = input as Record<string, unknown>;
  if (name === "apply_edits") {
    const edits = obj["edits"] as Array<Record<string, unknown>> | undefined;
    if (!edits) return "apply_edits";
    return `apply_edits (${edits.length} edits)`;
  }
  if (name === "query") {
    return `query ${String(obj["kind"] || "")} ${String(obj["tag"] || obj["id"] || "")}`.trim();
  }
  if (name === "jq") {
    return `jq ${String(obj["filter"] || "")}`;
  }
  if (name === "save_var") return `save_var ${String(obj["name"] || "")}`;
  if (name === "finish") return `finish: ${String(obj["summary"] || "")}`;
  if (name === "bail") return `bail: ${String(obj["reason"] || "")}`;
  return name;
}
