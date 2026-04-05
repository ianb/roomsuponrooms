import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, authedProcedure } from "./trpc.js";
import { getStorage } from "./storage-instance.js";
import { getImageStorage } from "./image-storage-instance.js";
import { generateImage } from "./image-gen.js";
import { getGame } from "../games/registry.js";

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
    const instance = def.create();
    const prompts = instance.prompts;
    return {
      imageStyleRoom: (prompts && prompts.imageStyleRoom) || null,
      imageStyleNpc: (prompts && prompts.imageStyleNpc) || null,
    };
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
});
