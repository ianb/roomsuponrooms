import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "./trpc.js";
import { getStorage } from "./storage-instance.js";

const adminProcedure = authedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.roles.includes("admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

export const adminRouter = router({
  adminDashboard: adminProcedure.query(async () => {
    const storage = getStorage();
    const users = storage.listUsers ? await storage.listUsers() : [];
    const sessions = storage.listUserSessions ? await storage.listUserSessions() : [];
    const aiUsage = storage.listAiUsageByUser ? await storage.listAiUsageByUser() : [];
    return { users, sessions, aiUsage };
  }),
});
