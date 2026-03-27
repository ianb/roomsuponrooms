import { initTRPC, TRPCError } from "@trpc/server";

export interface TrpcContext {
  userId: string | null;
  userName: string | null;
}

const t = initTRPC.context<TrpcContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/** Procedure that requires a valid session. Narrows ctx to non-null userId. */
export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in" });
  }
  return next({ ctx: { userId: ctx.userId, userName: ctx.userName! } });
});
