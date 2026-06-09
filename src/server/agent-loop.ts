import { generateText, stepCountIs, InvalidToolInputError } from "ai";
import type { LanguageModel, ModelMessage } from "ai";
import type { LanguageModelV3ToolCall } from "@ai-sdk/provider";
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

/**
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

/**
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

function summarizeToolCall(name: string, input: unknown): string {
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

  const context: ToolContext = {
    storage,
    gameId: session.gameId,
    userId: session.userId,
    sessionId: session.id,
    store: game.store,
    verbs: game.verbs,
    pendingEdits: await storage.getSessionEdits(sessionId),
    savedVars: { ...session.savedVars },
    terminate: null,
    editsSinceLastPlaytest: hasEditsSinceLastPlaytest(session.messages as ModelMessage[]),
  };

  // Apply already-emitted pending edits to the agent's view (in case this is
  // a resumed tick).
  applyPendingEditsToWorld(context.pendingEdits, {
    store: game.store,
    verbs: game.verbs,
    gameId: session.gameId,
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
      // The loop's only exit is the finish/bail tools — a text-only response
      // would end generateText with the session still "running", and models
      // (observed with gemini-2.5-flash) then re-emit the same prose summary
      // every tick until the turn limit kills the session. Forcing tool
      // choice makes "done" expressible only as finish().
      toolChoice: "required",
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
    await storage.updateAgentSession(sessionId, {
      status: "failed",
      summary: `Loop error: ${message}`,
      finishedAt: new Date().toISOString(),
    });
    return { status: "failed", turnsRun, summary: `Loop error: ${message}` };
  }

  // Append new response messages onto the persistent session messages.
  const newMessages: unknown[] = [...messages, ...lastResult.response.messages];
  // Fallback for providers that ignore toolChoice "required": if the model
  // ended with a text-only response (no finish/bail, no tool call), the next
  // tick would replay the identical context and stall the same way. Nudge it.
  const lastStep = lastResult.steps.at(-1);
  if (!context.terminate && lastStep && lastStep.toolCalls.length === 0) {
    newMessages.push({
      role: "user",
      content:
        "Respond ONLY with tool calls. If the work is complete and playtested, call " +
        "finish(summary); if you are stuck, call bail(reason). Otherwise keep working " +
        "with the tools.",
    });
  }
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

  if (context.terminate && context.terminate.kind === "finish") {
    await storage.commitSession(sessionId, context.terminate.summary);
    await storage.updateAgentSession(sessionId, tickPatch);
    return { status: "finished", turnsRun, summary: context.terminate.summary };
  }

  if (context.terminate && context.terminate.kind === "bail") {
    await storage.updateAgentSession(sessionId, {
      ...tickPatch,
      status: "bailed",
      summary: context.terminate.summary,
      finishedAt: new Date().toISOString(),
    });
    return { status: "bailed", turnsRun, summary: context.terminate.summary };
  }

  // Either we hit the step budget or the model decided not to call another tool.
  // If we ran out of turns relative to turnLimit, mark as failed.
  if (newTurnCount >= session.turnLimit) {
    const summary = `Turn limit (${session.turnLimit}) reached without finish().`;
    await storage.updateAgentSession(sessionId, {
      ...tickPatch,
      status: "failed",
      summary,
      finishedAt: new Date().toISOString(),
    });
    return { status: "failed", turnsRun, summary };
  }

  // Persist progress; status remains 'running' so a future tick can resume.
  await storage.updateAgentSession(sessionId, tickPatch);
  return { status: "running", turnsRun, summary: null };
}
