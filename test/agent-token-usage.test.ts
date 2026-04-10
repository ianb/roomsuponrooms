import t from "tap";
import type { LanguageModelUsage } from "ai";
import { mergeTokenUsage } from "../src/server/agent-token-usage.js";
import { computeCost, getModelPricing } from "../src/server/agent-pricing.js";
import { emptyAgentTokenUsage } from "../src/server/storage.js";

function fakeUsage(
  overrides: Partial<{
    inputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
  }>,
): LanguageModelUsage {
  return {
    inputTokens: overrides.inputTokens,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: overrides.cacheReadTokens,
      cacheWriteTokens: overrides.cacheWriteTokens,
    },
    outputTokens: overrides.outputTokens,
    outputTokenDetails: {
      textTokens: undefined,
      reasoningTokens: overrides.reasoningTokens,
    },
    totalTokens: overrides.totalTokens,
  } as LanguageModelUsage;
}

t.test("mergeTokenUsage adds incoming counts to current", (t) => {
  const start = emptyAgentTokenUsage();
  const result = mergeTokenUsage(
    start,
    fakeUsage({
      inputTokens: 100,
      cacheReadTokens: 30,
      outputTokens: 50,
      totalTokens: 150,
    }),
  );
  t.equal(result.inputTokens, 100);
  t.equal(result.cacheReadTokens, 30);
  t.equal(result.outputTokens, 50);
  t.equal(result.totalTokens, 150);
  t.end();
});

t.test("mergeTokenUsage accumulates across calls", (t) => {
  let usage = emptyAgentTokenUsage();
  usage = mergeTokenUsage(
    usage,
    fakeUsage({ inputTokens: 100, outputTokens: 20, totalTokens: 120 }),
  );
  usage = mergeTokenUsage(usage, fakeUsage({ inputTokens: 50, outputTokens: 10, totalTokens: 60 }));
  t.equal(usage.inputTokens, 150);
  t.equal(usage.outputTokens, 30);
  t.equal(usage.totalTokens, 180);
  t.end();
});

t.test("mergeTokenUsage tolerates undefined fields", (t) => {
  const result = mergeTokenUsage(emptyAgentTokenUsage(), fakeUsage({}));
  t.equal(result.inputTokens, 0);
  t.equal(result.outputTokens, 0);
  t.equal(result.totalTokens, 0);
  t.end();
});

t.test("mergeTokenUsage captures cache reads and writes separately", (t) => {
  const result = mergeTokenUsage(
    emptyAgentTokenUsage(),
    fakeUsage({
      inputTokens: 1000,
      cacheReadTokens: 800,
      cacheWriteTokens: 200,
      outputTokens: 100,
      totalTokens: 1100,
    }),
  );
  t.equal(result.inputTokens, 1000, "input total includes cached");
  t.equal(result.cacheReadTokens, 800);
  t.equal(result.cacheWriteTokens, 200);
  t.equal(result.outputTokens, 100);
  t.end();
});

t.test("getModelPricing returns gemini-3-flash-preview rates", (t) => {
  const pricing = getModelPricing("gemini-3-flash-preview");
  t.ok(pricing);
  t.equal(pricing!.input, 0.5);
  t.equal(pricing!.cacheRead, 0.05);
  t.equal(pricing!.output, 3);
  t.end();
});

t.test("getModelPricing returns null for unknown model", (t) => {
  t.equal(getModelPricing("not-a-real-model"), null);
  t.equal(getModelPricing(null), null);
  t.end();
});

t.test("computeCost prices an all-uncached run correctly", (t) => {
  // 1M input + 1M output, no cache
  const cost = computeCost("gemini-3-flash-preview", {
    inputTokens: 1_000_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 1_000_000,
    reasoningTokens: 0,
    totalTokens: 2_000_000,
  });
  t.ok(cost);
  // input $0.50 + output $3.00 = $3.50
  t.equal(cost!.totalUsd, 3.5);
  t.equal(cost!.breakdown.input, 0.5);
  t.equal(cost!.breakdown.output, 3);
  t.equal(cost!.breakdown.cacheRead, 0);
  t.end();
});

t.test("computeCost subtracts cached tokens from uncached input", (t) => {
  // 1M input total, 800k of which is cached → 200k uncached
  // uncached: 200k × $0.50/M = $0.10
  // cached read: 800k × $0.05/M = $0.04
  // output: 100k × $3.00/M = $0.30
  const cost = computeCost("gemini-3-flash-preview", {
    inputTokens: 1_000_000,
    cacheReadTokens: 800_000,
    cacheWriteTokens: 0,
    outputTokens: 100_000,
    reasoningTokens: 0,
    totalTokens: 1_100_000,
  });
  t.ok(cost);
  // 0.10 + 0.04 + 0.30 = 0.44, with floating-point slop
  t.ok(Math.abs(cost!.totalUsd - 0.44) < 1e-9, "total ≈ $0.44");
  t.ok(Math.abs(cost!.breakdown.input - 0.1) < 1e-9, "input ≈ $0.10");
  t.ok(Math.abs(cost!.breakdown.cacheRead - 0.04) < 1e-9, "cacheRead ≈ $0.04");
  t.ok(Math.abs(cost!.breakdown.output - 0.3) < 1e-9, "output ≈ $0.30");
  t.end();
});

t.test("computeCost returns null for unknown model", (t) => {
  const cost = computeCost("not-a-real-model", {
    inputTokens: 100,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 100,
    reasoningTokens: 0,
    totalTokens: 200,
  });
  t.equal(cost, null);
  t.end();
});

t.test("computeCost handles empty usage as zero cost", (t) => {
  const cost = computeCost("gemini-3-flash-preview", emptyAgentTokenUsage());
  t.ok(cost);
  t.equal(cost!.totalUsd, 0);
  t.end();
});
