import { z } from "zod";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { router, aiRoleProcedure } from "./trpc.js";
import { getStorage } from "./storage-instance.js";
import { tickSession } from "./agent-loop.js";
import { checkAiQuota } from "./ai-quota.js";
import { isValidGameId } from "../games/registry.js";
import { emptyAgentTokenUsage } from "./storage.js";
import type { AgentSessionRecord, AgentSessionStatus } from "./storage.js";

/** Agent sessions can mutate the shared world under their owner's provenance, so
 *  only the owner (or an admin) may inspect or advance one. */
export function canAccess(
  session: AgentSessionRecord,
  ctx: { userId: string; roles: string[] },
): boolean {
  return session.userId === ctx.userId || ctx.roles.includes("admin");
}

const validGameId = z.string().refine(isValidGameId, { message: "Unknown game" });

const startInputSchema = z.object({
  gameId: validGameId,
  instructions: z.string().min(1),
  turnLimit: z.number().int().min(1).max(100).optional(),
});

const sessionIdInput = z.object({ sessionId: z.string() });

const listInputSchema = z
  .object({
    gameId: validGameId.optional(),
    status: z.enum(["running", "finished", "bailed", "failed"]).optional(),
  })
  .optional();

function summarizeSession(session: AgentSessionRecord): {
  id: string;
  gameId: string;
  userId: string;
  request: string;
  status: AgentSessionStatus;
  turnCount: number;
  turnLimit: number;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
} {
  return {
    id: session.id,
    gameId: session.gameId,
    userId: session.userId,
    request: session.request,
    status: session.status,
    turnCount: session.turnCount,
    turnLimit: session.turnLimit,
    summary: session.summary,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    finishedAt: session.finishedAt,
  };
}

export const agentRouter = router({
  /**
   * Start a new agent session and run it synchronously to terminal.
   * The mutation returns once the session is finished, bailed, or failed.
   */
  start: aiRoleProcedure.input(startInputSchema).mutation(async ({ input, ctx }) => {
    const quotaMsg = await checkAiQuota(ctx.userId, ctx.roles);
    if (quotaMsg) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: quotaMsg });
    const storage = getStorage();
    const id = "s-" + nanoid(10);
    const now = new Date().toISOString();
    await storage.createAgentSession({
      id,
      gameId: input.gameId,
      userId: ctx.userId,
      request: input.instructions,
      status: "running",
      messages: [],
      savedVars: {},
      turnCount: 0,
      turnLimit: input.turnLimit || 30,
      summary: null,
      revertOf: null,
      model: null,
      systemPrompt: null,
      tokenUsage: emptyAgentTokenUsage(),
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    });

    // Drive ticks until terminal. In v1 we run synchronously per request.
    let result = await tickSession(id);
    let safety = 0;
    while (result.status === "running" && safety < 20) {
      result = await tickSession(id);
      safety += 1;
    }
    return { sessionId: id, status: result.status, summary: result.summary };
  }),

  /** Run a single tick on an existing running session (owner or admin only). */
  tick: aiRoleProcedure.input(sessionIdInput).mutation(async ({ input, ctx }) => {
    const session = await getStorage().getAgentSession(input.sessionId);
    if (!session || !canAccess(session, ctx)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not your agent session" });
    }
    const quotaMsg = await checkAiQuota(ctx.userId, ctx.roles);
    if (quotaMsg) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: quotaMsg });
    const result = await tickSession(input.sessionId);
    return { status: result.status, summary: result.summary, turnsRun: result.turnsRun };
  }),

  /** Get the current state of a session (owner or admin only). */
  status: aiRoleProcedure.input(sessionIdInput).query(async ({ input, ctx }) => {
    const session = await getStorage().getAgentSession(input.sessionId);
    if (!session || !canAccess(session, ctx)) return null;
    return summarizeSession(session);
  }),

  /** List sessions — scoped to the caller's own, unless admin. */
  list: aiRoleProcedure.input(listInputSchema).query(async ({ input, ctx }) => {
    const sessions = await getStorage().listAgentSessions(input);
    const visible = ctx.roles.includes("admin")
      ? sessions
      : sessions.filter((s) => s.userId === ctx.userId);
    return visible.map(summarizeSession);
  }),
});
