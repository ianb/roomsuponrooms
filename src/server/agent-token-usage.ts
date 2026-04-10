import type { LanguageModelUsage } from "ai";
import type { AgentTokenUsage } from "./storage.js";
import { emptyAgentTokenUsage } from "./storage.js";

/**
 * Add an SDK-reported LanguageModelUsage to a session's running token totals.
 *
 * The Vercel AI SDK exposes detailed token info on `usage`:
 *   - inputTokens: total input (prompt) tokens (cached + uncached)
 *   - inputTokenDetails.cacheReadTokens: cached prompt tokens billed at the cache-read rate
 *   - inputTokenDetails.cacheWriteTokens: cached prompt tokens billed at the cache-write rate
 *   - outputTokens: total output tokens (text + reasoning)
 *   - outputTokenDetails.reasoningTokens: thinking tokens included in outputTokens
 *   - totalTokens: input + output (provider-reported)
 *
 * Any field can be `undefined` when the provider doesn't report it. We treat
 * those as zero so accumulation stays deterministic.
 */
export function mergeTokenUsage(
  current: AgentTokenUsage,
  incoming: LanguageModelUsage,
): AgentTokenUsage {
  const inDetails = incoming.inputTokenDetails || {
    noCacheTokens: undefined,
    cacheReadTokens: undefined,
    cacheWriteTokens: undefined,
  };
  const outDetails = incoming.outputTokenDetails || {
    textTokens: undefined,
    reasoningTokens: undefined,
  };
  return {
    inputTokens: current.inputTokens + (incoming.inputTokens || 0),
    cacheReadTokens: current.cacheReadTokens + (inDetails.cacheReadTokens || 0),
    cacheWriteTokens: current.cacheWriteTokens + (inDetails.cacheWriteTokens || 0),
    outputTokens: current.outputTokens + (incoming.outputTokens || 0),
    reasoningTokens: current.reasoningTokens + (outDetails.reasoningTokens || 0),
    totalTokens: current.totalTokens + (incoming.totalTokens || 0),
  };
}

export { emptyAgentTokenUsage };
