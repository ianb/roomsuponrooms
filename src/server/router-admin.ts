import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, authedProcedure } from "./trpc.js";
import { getStorage } from "./storage-instance.js";
import { getImageStorage } from "./image-storage-instance.js";
import { generateImage } from "./image-gen.js";
import { getGame } from "../games/registry.js";
import { BUILD_COMMIT, BUILD_TIME } from "../../generated/build-version.js";

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
    return { users, sessions, aiUsage, buildCommit: BUILD_COMMIT, buildTime: BUILD_TIME };
  }),

  adminImageSettings: adminProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ input }) => {
      const storage = getStorage();
      if (!storage.getImageSettings) return null;
      return storage.getImageSettings(input.gameId);
    }),

  adminImageDefaults: adminProcedure.input(z.object({ gameId: z.string() })).query(({ input }) => {
    const def = getGame(input.gameId);
    if (!def) return { imageStyleRoom: null, imageStyleNpc: null };
    try {
      const instance = def.create();
      const prompts = instance.prompts;
      return {
        imageStyleRoom: (prompts && prompts.imageStyleRoom) || null,
        imageStyleNpc: (prompts && prompts.imageStyleNpc) || null,
      };
    } catch (_e) {
      return { imageStyleRoom: null, imageStyleNpc: null };
    }
  }),

  adminRevertImageSettings: adminProcedure
    .input(z.object({ gameId: z.string() }))
    .mutation(async ({ input }) => {
      const storage = getStorage();
      if (!storage.saveImageSettings) return;
      await storage.saveImageSettings({
        gameId: input.gameId,
        imagesEnabled: true,
        imageStyleRoom: null,
        imageStyleNpc: null,
      });
    }),

  adminUpdateImageSettings: adminProcedure
    .input(
      z.object({
        gameId: z.string(),
        imagesEnabled: z.boolean(),
        imageStyleRoom: z.string().nullable(),
        imageStyleNpc: z.string().nullable(),
      }),
    )
    .mutation(async ({ input }) => {
      const storage = getStorage();
      if (!storage.saveImageSettings) return;
      await storage.saveImageSettings({
        gameId: input.gameId,
        imagesEnabled: input.imagesEnabled,
        imageStyleRoom: input.imageStyleRoom,
        imageStyleNpc: input.imageStyleNpc,
      });
    }),

  adminListWorldImages: adminProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ input }) => {
      const storage = getStorage();
      if (!storage.listWorldImages) return [];
      return storage.listWorldImages(input.gameId);
    }),

  adminGenerateImage: adminProcedure
    .input(
      z.object({
        gameId: z.string(),
        imageType: z.enum(["room-reference", "npc-reference"]),
        prompt: z.string(),
        stylePrompt: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const storage = getStorage();
      const aspectRatio = input.imageType === "room-reference" ? "16:9" : "3:4";

      const generated = await generateImage({
        prompt: input.prompt,
        stylePrompt: input.stylePrompt,
        aspectRatio,
      });

      const r2Key = `${input.gameId}/images/${input.imageType}.png`;
      const imageStorage = getImageStorage();
      await imageStorage.putImage({
        key: r2Key,
        data: generated.data,
        mimeType: generated.mimeType,
      });

      const now = new Date().toISOString();
      const record = {
        gameId: input.gameId,
        imageType: input.imageType,
        r2Key,
        promptUsed: input.prompt,
        stylePrompt: input.stylePrompt,
        mimeType: generated.mimeType,
        width: null,
        height: null,
        createdAt: now,
      };

      if (storage.saveWorldImage) {
        await storage.saveWorldImage(record);
      }

      return record;
    }),

  adminDeleteImage: adminProcedure
    .input(z.object({ gameId: z.string(), imageType: z.string() }))
    .mutation(async ({ input }) => {
      const storage = getStorage();
      const query = { gameId: input.gameId, imageType: input.imageType };
      const image = storage.getWorldImage ? await storage.getWorldImage(query) : null;
      if (image) {
        await getImageStorage().deleteImage(image.r2Key);
      }
      if (storage.deleteWorldImage) {
        await storage.deleteWorldImage(query);
      }
    }),

  adminAgentSessions: adminProcedure
    .input(
      z
        .object({
          gameId: z.string().optional(),
          status: z.enum(["running", "finished", "bailed", "failed"]).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const storage = getStorage();
      const sessions = await storage.listAgentSessions(input);
      const summaries = await Promise.all(
        sessions.map(async (s) => {
          const edits = await storage.getSessionEdits(s.id);
          return {
            id: s.id,
            gameId: s.gameId,
            userId: s.userId,
            request: s.request,
            status: s.status,
            turnCount: s.turnCount,
            turnLimit: s.turnLimit,
            summary: s.summary,
            editCount: edits.length,
            appliedEditCount: edits.filter((e) => e.applied).length,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            finishedAt: s.finishedAt,
          };
        }),
      );
      return { sessions: summaries };
    }),

  adminAgentSession: adminProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const storage = getStorage();
    const session = await storage.getAgentSession(input.id);
    if (!session) return null;
    const edits = await storage.getSessionEdits(input.id);
    return { session, edits };
  }),
});
