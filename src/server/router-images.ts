import { z } from "zod";
import { generateText } from "ai";
import { router, authedProcedure } from "./trpc.js";
import { getStorage } from "./storage-instance.js";
import { getImageStorage } from "./image-storage-instance.js";
import { generateImage } from "./image-gen.js";
import { getGame } from "../games/registry.js";
import { getLlm } from "./llm.js";
import type { ImageStorage } from "./image-storage.js";

/** Resolve style prompt from D1 settings, falling back to game file prompts */
async function resolveStylePrompt(gameId: string, entityType: "room" | "npc"): Promise<string> {
  const storage = getStorage();
  const settings = storage.getImageSettings ? await storage.getImageSettings(gameId) : null;
  const fromSettings =
    entityType === "room"
      ? (settings && settings.imageStyleRoom) || ""
      : (settings && settings.imageStyleNpc) || "";
  if (fromSettings) return fromSettings;
  const def = getGame(gameId);
  if (!def) return "";
  try {
    const prompts = def.create().prompts;
    if (!prompts) return "";
    return (entityType === "room" ? prompts.imageStyleRoom : prompts.imageStyleNpc) || "";
  } catch (_e) {
    return "";
  }
}

/** Resolve image prompt from input, entity ai field, or LLM generation from description */
async function resolveImagePrompt(input: {
  imagePrompt: string;
  gameId: string;
  entityId: string;
  entityType: string;
}): Promise<string> {
  if (input.imagePrompt) return input.imagePrompt;
  const def = getGame(input.gameId);
  if (!def) return "";
  const instance = def.create();
  if (!instance.store.has(input.entityId)) return "";
  const entity = instance.store.get(input.entityId);
  const aiPrompt = entity.ai && entity.ai.imagePrompt;
  if (aiPrompt) return aiPrompt;
  if (!entity.description) return "";
  const result = await generateText({
    model: getLlm(),
    system: `You write concise image generation prompts. Given a text description of a ${input.entityType} in a game world, produce a visual description suitable for image generation. Focus on concrete visual details: colors, lighting, materials, composition, atmosphere. 1-3 sentences. Output ONLY the visual prompt, nothing else.`,
    prompt: entity.description,
  });
  return result.text.trim();
}

/** Load reference image bytes if available */
async function loadReferenceImage(
  imageStorage: ImageStorage,
  query: { gameId: string; entityType: "room" | "npc" },
): Promise<{ data: Uint8Array; mimeType: string } | undefined> {
  const refType = query.entityType === "room" ? "room-reference" : "npc-reference";
  const refKey = `${query.gameId}/images/${refType}.png`;
  const refResult = await imageStorage.getImage(refKey);
  if (!refResult) return undefined;
  const data =
    refResult.data instanceof Uint8Array
      ? refResult.data
      : new Uint8Array(await new Response(refResult.data).arrayBuffer());
  return { data, mimeType: refResult.mimeType };
}

export const imageRouter = router({
  entityImageStatus: authedProcedure
    .input(z.object({ gameId: z.string(), entityIds: z.array(z.string()) }))
    .query(async ({ input }) => {
      const storage = getStorage();
      if (!storage.listWorldImages) return {};
      const images = await storage.listWorldImages(input.gameId);
      const result: Record<string, boolean> = {};
      for (const id of input.entityIds) {
        result[id] = images.some((img) => img.imageType === `entity:${id}`);
      }
      return result;
    }),

  generateEntityImage: authedProcedure
    .input(
      z.object({
        gameId: z.string(),
        entityId: z.string(),
        entityType: z.enum(["room", "npc"]),
        imagePrompt: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.roles.includes("admin")) {
        return { error: "Admin access required" };
      }

      const stylePrompt = await resolveStylePrompt(input.gameId, input.entityType);
      if (!stylePrompt) {
        return { error: "No style prompt configured for this image type" };
      }

      const imagePrompt = await resolveImagePrompt(input);
      if (!imagePrompt) {
        return { error: "Entity not found or no description available" };
      }

      const imageStorage = getImageStorage();
      const referenceImage = await loadReferenceImage(imageStorage, {
        gameId: input.gameId,
        entityType: input.entityType,
      });
      const aspectRatio = input.entityType === "room" ? "16:9" : "3:4";
      const generated = await generateImage({
        prompt: imagePrompt,
        stylePrompt,
        aspectRatio,
        referenceImage,
      });

      const safeId = input.entityId.replace(/:/g, "/");
      const r2Key = `${input.gameId}/entities/${safeId}.png`;
      await imageStorage.putImage({
        key: r2Key,
        data: generated.data,
        mimeType: generated.mimeType,
      });

      const storage = getStorage();
      const record = {
        gameId: input.gameId,
        imageType: `entity:${input.entityId}`,
        r2Key,
        promptUsed: imagePrompt,
        stylePrompt,
        mimeType: generated.mimeType,
        width: null,
        height: null,
        createdAt: new Date().toISOString(),
      };
      if (storage.saveWorldImage) {
        await storage.saveWorldImage(record);
      }

      return { imageUrl: `/api/images/${r2Key}` };
    }),
});
