import { initTRPC, TRPCError } from "@trpc/server";

export interface TrpcContext {
  userId: string | null;
  userName: string | null;
  roles: string[];
}

const t = initTRPC.context<TrpcContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/** Procedure that requires a valid session. Narrows ctx to non-null userId. */
export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in" });
  }
  return next({ ctx: { userId: ctx.userId, userName: ctx.userName!, roles: ctx.roles } });
});

/**
 * Procedure that requires the caller to have the "ai" role. Used by agentic
 * world-editing endpoints which can mutate the shared world. Layered on top
 * of authedProcedure for the userId narrowing.
 */
export const aiRoleProcedure = authedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.roles.includes("ai")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Requires the 'ai' role",
    });
  }
  return next({ ctx });
});

/** Procedure that requires the "admin" role (granted to API-key callers). */
export const adminProcedure = authedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.roles.includes("admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});
