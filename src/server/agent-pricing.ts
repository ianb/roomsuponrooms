import type { AgentTokenUsage } from "./storage.js";

/**
 * USD pricing per 1,000,000 tokens, by model id. The agent loop persists the
 * model id used for each session; the admin UI looks up the rates here when
 * computing total cost.
 *
 * Sources:
 *   - Gemini 3 Flash Preview: https://ai.google.dev/gemini-api/docs/pricing
 *     (input $0.50/M, cache read $0.05/M, output $3.00/M as of 2026-04)
 */
export interface ModelPricing {
  /** USD per 1,000,000 uncached input tokens. */
  input: number;
  /** USD per 1,000,000 cached input tokens (read). */
  cacheRead: number;
  /** USD per 1,000,000 cached input tokens (write). 0 if free. */
  cacheWrite: number;
  /** USD per 1,000,000 output tokens (includes reasoning). */
  output: number;
}

const PRICING: Record<string, ModelPricing> = {
  "gemini-3-flash-preview": {
    input: 0.5,
    cacheRead: 0.05,
    cacheWrite: 0,
    output: 3,
  },
  "gemini-2.5-flash": {
    input: 0.075,
    cacheRead: 0.01875,
    cacheWrite: 0,
    output: 0.3,
  },
  // OpenRouter models (rates from openrouter.ai/api/v1/models, 2026-06-09;
  // cacheRead 0 = no cache discount reported).
  "deepseek/deepseek-chat": {
    input: 0.2,
    cacheRead: 0,
    cacheWrite: 0,
    output: 0.8,
  },
  "openai/gpt-oss-120b": {
    input: 0.039,
    cacheRead: 0,
    cacheWrite: 0,
    output: 0.18,
  },
  "moonshotai/kimi-k2": {
    input: 0.57,
    cacheRead: 0,
    cacheWrite: 0,
    output: 2.3,
  },
};

/** Look up pricing for a model id, or null if unknown. */
export function getModelPricing(model: string | null): ModelPricing | null {
  if (!model) return null;
  return PRICING[model] || null;
}

/**
 * Compute USD cost for a session's token usage. Returns null if the model is
 * unknown (so the UI can show "—" rather than a misleading $0.00).
 *
 * Uncached input tokens are computed as inputTokens - cacheReadTokens, since
 * the SDK reports inputTokens as the sum of cached + uncached.
 */
export function computeCost(
  model: string | null,
  usage: AgentTokenUsage,
): {
  totalUsd: number;
  breakdown: { input: number; cacheRead: number; cacheWrite: number; output: number };
} | null {
  const pricing = getModelPricing(model);
  if (!pricing) return null;
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cacheReadTokens);
  const inputCost = (uncachedInput / 1_000_000) * pricing.input;
  const cacheReadCost = (usage.cacheReadTokens / 1_000_000) * pricing.cacheRead;
  const cacheWriteCost = (usage.cacheWriteTokens / 1_000_000) * pricing.cacheWrite;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
  return {
    totalUsd: inputCost + cacheReadCost + cacheWriteCost + outputCost,
    breakdown: {
      input: inputCost,
      cacheRead: cacheReadCost,
      cacheWrite: cacheWriteCost,
      output: outputCost,
    },
  };
}

/** Format a USD amount for display. Uses dollars if >= $0.01, else mils. */
export function formatCost(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return `${(usd * 1000).toFixed(2)}m¢`;
  if (usd < 1) return `${(usd * 100).toFixed(2)}¢`;
  return `$${usd.toFixed(4)}`;
}
