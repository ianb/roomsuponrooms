import type { LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

class UnknownLlmProviderError extends Error {
  override name = "UnknownLlmProviderError";
  constructor(provider: string) {
    super(`Unknown LLM provider: ${provider}`);
  }
}

class LlmNotConfiguredError extends Error {
  override name = "LlmNotConfiguredError";
  constructor() {
    super("LLM not configured — set LLM_PROVIDER and LLM_MODEL environment variables");
  }
}

interface LlmConfig {
  provider: "google" | "anthropic" | "openrouter";
  model: string;
}

/**
 * Construct a LanguageModel for an explicit provider/model pair. Used by
 * getLlm() for the configured default and by the eval harness to test
 * arbitrary models without touching global config. OpenRouter needs
 * OPENROUTER_API_KEY; google/anthropic use their usual env keys.
 */
export function createModel({ provider, model }: LlmConfig): LanguageModel {
  if (provider === "google") {
    return createGoogleGenerativeAI()(model);
  }
  if (provider === "anthropic") {
    return createAnthropic()(model);
  }
  if (provider === "openrouter") {
    return createOpenRouter()(model);
  }
  throw new UnknownLlmProviderError(provider);
}

let cachedModel: LanguageModel | null = null;
let cachedConfig: LlmConfig | null = null;

function loadConfig(): LlmConfig {
  const provider = process.env["LLM_PROVIDER"];
  const model = process.env["LLM_MODEL"];
  if (provider && model) {
    return { provider: provider as LlmConfig["provider"], model };
  }

  // Fallback: try llm-config.json (Node.js local dev only)
  try {
    // Dynamic import to avoid bundling node:fs into the Worker
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs");
    const raw = fs.readFileSync("llm-config.json", "utf-8") as string;
    return JSON.parse(raw) as LlmConfig;
  } catch (_e) {
    throw new LlmNotConfiguredError();
  }
}

export function getLlm(): LanguageModel {
  if (cachedModel) return cachedModel;
  const config = loadConfig();
  cachedConfig = config;
  cachedModel = createModel(config);
  return cachedModel;
}

/** The configured model id, for logging/telemetry. Falls back to "unknown"
 *  if no LLM is configured (e.g. in tests with a mock model). */
export function getLlmModelId(): string {
  try {
    const config = cachedConfig || loadConfig();
    return `${config.provider}:${config.model}`;
  } catch (_e) {
    return "unknown";
  }
}

/** Default timeout (ms) for AI API calls */
export const LLM_TIMEOUT_MS = 45_000;

/** Create an AbortSignal that fires after the default LLM timeout */
export function getLlmAbortSignal(): AbortSignal {
  return AbortSignal.timeout(LLM_TIMEOUT_MS);
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type ProviderOpts = Record<string, Record<string, JsonValue>>;

/**
 * Provider-specific options to enable thinking/reasoning. Returns an empty
 * object if no LLM is configured (e.g. running tests with a mock model)
 * rather than throwing — callers should always be able to forward provider
 * options without first checking that an LLM is set up.
 */
export function getLlmProviderOptions(): ProviderOpts {
  let config: LlmConfig;
  try {
    config = cachedConfig || loadConfig();
  } catch (_e) {
    return {};
  }
  if (config.provider === "google") {
    return { google: { thinkingConfig: { thinkingBudget: 2048 } } };
  }
  if (config.provider === "anthropic") {
    return { anthropic: { thinking: { type: "enabled", budgetTokens: 2048 } } };
  }
  return {};
}
