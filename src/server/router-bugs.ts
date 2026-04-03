import { z } from "zod";
import { router, publicProcedure, authedProcedure } from "./trpc.js";
import { getStorage } from "./storage-instance.js";
import { submitBugReport } from "./bug-commands.js";
import type { BugPreview } from "./bug-commands.js";
import type { EventLogEntry, EntityChangeRecord, BugReportStatus } from "./storage.js";

const bugReportStatuses: [BugReportStatus, ...BugReportStatus[]] = [
  "new",
  "seen",
  "fixed",
  "invalid",
  "duplicate",
];

export const bugRouter = router({
  submitBug: authedProcedure
    .input(
      z.object({
        gameId: z.string(),
        description: z.string(),
        roomId: z.string().nullable(),
        roomName: z.string().nullable(),
        recentCommands: z.string(),
        entityChanges: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const preview: BugPreview = {
        gameId: input.gameId,
        userId: ctx.userId,
        userName: ctx.userName || null,
        description: input.description,
        roomId: input.roomId,
        roomName: input.roomName,
        recentCommands: JSON.parse(input.recentCommands) as EventLogEntry[],
        entityChanges: JSON.parse(input.entityChanges) as EntityChangeRecord[],
      };
      const report = await submitBugReport(preview);
      return { id: report.id, url: `/bugs/${report.id}` };
    }),

  bugs: publicProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          gameId: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      return getStorage().listBugReports(input || undefined);
    }),

  bug: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    return getStorage().getBugReport(input.id);
  }),

  updateBug: authedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(bugReportStatuses).optional(),
        fixCommit: z.string().optional(),
        duplicateOf: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...update } = input;
      await getStorage().updateBugReport(id, update);
      return { ok: true };
    }),
});
