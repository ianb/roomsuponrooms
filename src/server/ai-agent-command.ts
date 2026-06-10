import { nanoid } from "nanoid";
import { tickSession } from "./agent-loop.js";
import type { AgentProgressCallback } from "./agent-loop.js";
import { getStorage } from "./storage-instance.js";
import { emptyAgentTokenUsage } from "./storage.js";
import type { AuthoringInfo, WorldEditRecord } from "./storage.js";

interface CommandResponse {
  output: string;
}

/**
 * Entry point for the `ai agent <instructions>` player command. Creates a
 * new agent session and drives the loop synchronously to terminal, then
 * returns a small status summary.
 */
export async function handleAiAgentCommand({
  instructions,
  gameId,
  userId,
  authoring,
  onProgress,
}: {
  instructions: string;
  gameId: string;
  userId: string;
  authoring: AuthoringInfo;
  onProgress?: AgentProgressCallback;
}): Promise<CommandResponse> {
  const storage = getStorage();
  const id = "s-" + nanoid(10);
  const now = new Date().toISOString();
  await storage.createAgentSession({
    id,
    gameId,
    userId,
    request: instructions,
    status: "running",
    messages: [],
    savedVars: {},
    turnCount: 0,
    turnLimit: 30,
    summary: null,
    revertOf: null,
    model: null,
    systemPrompt: null,
    tokenUsage: emptyAgentTokenUsage(),
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  });
  // Drive ticks until terminal. Per Phase 5 plan: synchronous in v1.
  // Rate-limited ticks (throttled) back off exponentially — the player is
  // waiting, so cap the total wait at ~1 minute before reporting back.
  let result = await tickSession(id, { onProgress });
  let safety = 0;
  let throttles = 0;
  while (result.status === "running" && safety < 20 && throttles < 5) {
    if (result.throttled) {
      throttles += 1;
      const delayMs = Math.min(2000 * 2 ** (throttles - 1), 30_000);
      if (onProgress) {
        onProgress({
          turn: 0,
          toolCalls: [{ name: "wait", summary: `AI rate-limited; retrying in ${delayMs / 1000}s` }],
        });
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } else {
      safety += 1;
    }
    result = await tickSession(id, { onProgress });
  }
  // Lead with a link to the admin detail page so the player can open the
  // session log in a new tab as soon as the command finishes.
  const lines: string[] = [
    `{link:/admin/agent-sessions/${id}|Agent session ${id}} · ${result.status}`,
  ];
  if (result.throttled) {
    lines.push(
      "The AI provider is rate-limiting requests right now and the agent couldn't finish. " +
        "Its partial progress is saved in the session log; nothing was committed. " +
        "Try again in a minute.",
    );
  } else if (result.summary) {
    lines.push(result.summary);
  }
  const session = await storage.getAgentSession(id);
  if (session) {
    const edits = await storage.getSessionEdits(id);
    const applied = edits.filter((e: WorldEditRecord) => e.applied).length;
    lines.push(`Turns: ${session.turnCount}/${session.turnLimit} · Edits applied: ${applied}`);
  }
  // authoring is reserved for future logging on per-edit provenance.
  void authoring;
  return { output: lines.join("\n") };
}

// Re-exported via ai-commands.ts for backwards compatibility with the
// special-commands import path.
