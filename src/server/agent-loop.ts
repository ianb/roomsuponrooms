import { generateText, stepCountIs } from "ai";
import type { LanguageModel, ModelMessage } from "ai";
import {
  repairDoubleEncodedToolCall,
  stallDisposition,
  NUDGE,
  hasEditsSinceLastPlaytest,
  hasQueriedWorld,
  isRateLimitError,
  summarizeToolCall,
} from "./agent-loop-support.js";
import { getLlm, getLlmProviderOptions } from "./llm.js";
import { getStorage } from "./storage-instance.js";
import { applyPendingEditsToWorld } from "./agent-world-view.js";
import { buildAgentTools } from "./agent-tools.js";
import { buildAgentSystemPrompt } from "./agent-system-prompt.js";
import { buildSessionContextMessage } from "./agent-session-context.js";
import { loadAgentGameInstance } from "./agent-game-loader.js";
import type { ToolContext } from "./agent-tool-context.js";
import type { AgentSessionStatus } from "./storage.js";
import { mergeTokenUsage } from "./agent-token-usage.js";

class SessionNotFoundError extends Error {
  override name = "SessionNotFoundError";
  constructor(id: string) {
    super(`Agent session not found: ${id}`);
  }
}

class SessionAlreadyTerminalError extends Error {
  override name = "SessionAlreadyTerminalError";
  constructor(id: string, status: AgentSessionStatus) {
    super(`Agent session ${id} is already in terminal state: ${status}`);
  }
}

export interface TickResult {
  status: AgentSessionStatus;
  turnsRun: number;
  summary: string | null;
  /**
   * Set when the tick made no progress because the provider rate-limited us
   * (quota / 429 / transient 5xx) even after the SDK's own retries. The
   * session is left "running" and untouched — the caller should back off
   * and tick again rather than treating the session as dead.
   */
  throttled?: boolean;
}

/**
 * Per-step progress event emitted as the agent works. Useful for streaming
 * status to the player UI so an `ai agent` command shows what the agent is
 * actually doing instead of just hanging on a "...".
 */
export interface AgentProgressEvent {
  turn: number;
  toolCalls: Array<{ name: string; summary: string }>;
}

export type AgentProgressCallback = (event: AgentProgressEvent) => void;

/**
 * Run a single tick of the agent loop. Loads the session, drives generateText
 * with the agent tools, persists the resulting messages, and either commits
 * (on finish), abandons (on bail), or leaves running for the next tick.
 *
 * In v1 we run the loop synchronously to terminal in one tick by default,
 * since the user has agreed to start with synchronous execution. The
 * `maxStepsPerTick` parameter caps how many tool-use steps a single tick
 * will burn before yielding.
 */
export async function tickSession(
  sessionId: string,
  options?: {
    model?: LanguageModel;
    maxStepsPerTick?: number;
    onProgress?: AgentProgressCallback;
  },
): Promise<TickResult> {
  const storage = getStorage();
  const session = await storage.getAgentSession(sessionId);
  if (!session) throw new SessionNotFoundError(sessionId);
  if (session.status !== "running") {
    throw new SessionAlreadyTerminalError(sessionId, session.status);
  }

  const game = await loadAgentGameInstance(session.gameId);
  game.conversations = game.conversations || {};

  const context: ToolContext = {
    storage,
    gameId: session.gameId,
    userId: session.userId,
    sessionId: session.id,
    store: game.store,
    verbs: game.verbs,
    conversations: game.conversations,
    pendingEdits: await storage.getSessionEdits(sessionId),
    savedVars: { ...session.savedVars },
    terminate: null,
    editsSinceLastPlaytest: hasEditsSinceLastPlaytest(session.messages as ModelMessage[]),
    hasQueriedWorld: hasQueriedWorld(session.messages as ModelMessage[]),
  };

  // Apply already-emitted pending edits to the agent's view (in case this is
  // a resumed tick).
  applyPendingEditsToWorld(context.pendingEdits, {
    store: game.store,
    verbs: game.verbs,
    gameId: session.gameId,
    conversations: game.conversations,
  });

  const tools = buildAgentTools(context);
  const systemPrompt = buildAgentSystemPrompt({
    store: game.store,
    prompts: game.prompts,
    libClass: game.libClass,
  });

  const messages: ModelMessage[] =
    session.messages.length > 0
      ? (session.messages as ModelMessage[])
      : [
          {
            role: "user",
            content: await buildSessionContextMessage(game.store, {
              storage,
              gameId: session.gameId,
              userId: session.userId,
              request: session.request,
            }),
          },
        ];

  const model = options && options.model ? options.model : getLlm();
  const stepBudget = options && options.maxStepsPerTick ? options.maxStepsPerTick : 30;
  const remainingTurns = session.turnLimit - session.turnCount;
  const stepLimit = Math.min(stepBudget, Math.max(remainingTurns, 1));

  let turnsRun = 0;
  let lastResult;
  const onProgress = options && options.onProgress;
  let stepIndex = 0;

  try {
    lastResult = await generateText({
      model,
      system: systemPrompt,
      messages,
      tools,
      providerOptions: getLlmProviderOptions(),
      // NOTE: do NOT set toolChoice: "required" here. Gemini's forced
      // function-calling mode uses constrained decoding that cannot emit
      // free-form object keys, so every entityUpdate "properties" payload
      // arrives as {} and agents can't write entity state at all. The
      // prose-stall problem that toolChoice was meant to fix (model
      // announcing completion in text instead of calling finish()) is
      // handled by the corrective nudge below instead.
      experimental_repairToolCall: repairDoubleEncodedToolCall,
      // Stop on terminate (set by an ACCEPTED finish/bail) rather than on the
      // finish tool call itself — finish() can be rejected (e.g. edits not
      // playtested) and the loop should continue so the model can comply.
      stopWhen: [stepCountIs(stepLimit), () => context.terminate !== null],
      onStepFinish: (step) => {
        stepIndex += 1;
        const calls = step.toolCalls.map((call) => ({
          name: call.toolName,
          summary: summarizeToolCall(call.toolName, call.input),
        }));
        const turn = session.turnCount + stepIndex;
        if (calls.length > 0) {
          console.log(`[agent ${session.id} t${turn}] ${calls.map((c) => c.summary).join(" · ")}`);
        }
        if (onProgress) onProgress({ turn, toolCalls: calls });
      },
    });
    turnsRun = lastResult.steps.length;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    if (isRateLimitError(e)) {
      // Transient: leave the session running and unmodified so a later tick
      // can pick it up. Marking it failed here would destroy a session (and
      // its pending edits) over a 429 that clears in seconds.
      console.error(`[agent ${session.id}] rate-limited; session left resumable: ${message}`);
      return { status: "running", turnsRun: 0, summary: null, throttled: true };
    }
    await storage.updateAgentSession(sessionId, {
      status: "failed",
      summary: `Loop error: ${message}`,
      finishedAt: new Date().toISOString(),
    });
    return { status: "failed", turnsRun, summary: `Loop error: ${message}` };
  }

  // Append new response messages onto the persistent session messages.
  const newMessages: unknown[] = [...messages, ...lastResult.response.messages];
  const stall = stallDisposition(lastResult.steps, {
    terminated: context.terminate !== null,
    priorMessages: session.messages,
  });
  if (stall === "nudge") newMessages.push({ role: "user", content: NUDGE });
  const newTurnCount = session.turnCount + turnsRun;
  // Accumulate token usage from this generateText call into the session's
  // running total. totalUsage spans every step inside the call.
  const newTokenUsage = mergeTokenUsage(session.tokenUsage, lastResult.totalUsage);
  // Capture the model id once (subsequent ticks reuse it). LanguageModel
  // can be either a string id or a model object with `.modelId`.
  const modelId = session.model || (typeof model === "string" ? model : model.modelId) || null;
  // Capture the system prompt on first use. Don't overwrite on later ticks
  // — the world has evolved and we want the original prompt for the audit.
  const persistedSystemPrompt = session.systemPrompt || systemPrompt;

  // Common patch fields applied to whichever updateAgentSession call below
  // ends up running for this tick.
  const tickPatch = {
    messages: newMessages,
    savedVars: context.savedVars,
    turnCount: newTurnCount,
    tokenUsage: newTokenUsage,
    model: modelId,
    systemPrompt: persistedSystemPrompt,
  };

  return settleTick({
    storage,
    sessionId,
    tickPatch,
    terminate: context.terminate,
    stall,
    turnsRun,
    newTurnCount,
    turnLimit: session.turnLimit,
  });
}

/**
 * Persist the tick's outcome and produce the TickResult: commit on finish,
 * mark bailed/failed terminal states, or leave the session running.
 */
async function settleTick({
  storage,
  sessionId,
  tickPatch,
  terminate,
  stall,
  turnsRun,
  newTurnCount,
  turnLimit,
}: {
  storage: ReturnType<typeof getStorage>;
  sessionId: string;
  tickPatch: Record<string, unknown>;
  terminate: ToolContext["terminate"];
  stall: "nudge" | "give-up" | null;
  turnsRun: number;
  newTurnCount: number;
  turnLimit: number;
}): Promise<TickResult> {
  const failWith = async (summary: string): Promise<TickResult> => {
    await storage.updateAgentSession(sessionId, {
      ...tickPatch,
      status: "failed",
      summary,
      finishedAt: new Date().toISOString(),
    });
    return { status: "failed", turnsRun, summary };
  };

  if (stall === "give-up") {
    return failWith(
      "Model stopped producing tool calls (empty or text-only responses after repeated nudges).",
    );
  }

  if (terminate && terminate.kind === "finish") {
    await storage.commitSession(sessionId, terminate.summary);
    await storage.updateAgentSession(sessionId, tickPatch);
    return { status: "finished", turnsRun, summary: terminate.summary };
  }

  if (terminate && terminate.kind === "bail") {
    await storage.updateAgentSession(sessionId, {
      ...tickPatch,
      status: "bailed",
      summary: terminate.summary,
      finishedAt: new Date().toISOString(),
    });
    return { status: "bailed", turnsRun, summary: terminate.summary };
  }

  // Either we hit the step budget or the model decided not to call another
  // tool. If we ran out of turns relative to turnLimit, mark as failed.
  if (newTurnCount >= turnLimit) {
    return failWith(`Turn limit (${turnLimit}) reached without finish().`);
  }

  // Persist progress; status remains 'running' so a future tick can resume.
  await storage.updateAgentSession(sessionId, tickPatch);
  return { status: "running", turnsRun, summary: null };
}
