import { z } from "zod";
import type { EntityStore } from "../core/entity.js";
import { buildPropertiesSchema } from "./ai-prompt-helpers.js";

const ROOM_EXCLUDED = [
  "name",
  "description",
  "location",
  "aliases",
  "direction",
  "destination",
  "destinationIntent",
  "gridX",
  "gridY",
  "gridZ",
];

export function buildRoomSchema(store: EntityStore) {
  const propsSchema = buildPropertiesSchema(store, { exclude: ROOM_EXCLUDED });
  return z.object({
    reasoning: z
      .string()
      .describe(
        "FIRST, reason about what belongs here. Consider: the exit's stated intent; the textures and character of the surrounding rooms (see <area-pacing>); what the player just passed through; what would give this area variety and good pacing. Decide whether this room should be a quiet connective space, an ordinary room, or a rich destination — and how it should contrast with its neighbors (sound, light, scale, mood). 2-4 sentences.",
      ),
    room: z.object({
      idSlug: z.string().describe("Short kebab-case slug for the room ID."),
      texture: z
        .enum(["sparse", "plain", "rich"])
        .describe(
          "The pacing decision from your reasoning. sparse = deliberately unremarkable connective space (corridors, passages, in-between stretches); plain = an ordinary room; rich = a destination that rewards deep exploration. Rich is RARE and must be earned — when in doubt, choose the quieter option.",
        ),
      name: z.string().describe("Display name for the room."),
      description: z.string().describe("Full room description. 2-4 sentences."),
      tags: z.array(z.string()).describe("Tags for the room. Always include 'room'."),
      properties: propsSchema,
      secret: z
        .string()
        .optional()
        .describe(
          "Optional hidden interactive potential (not shown to player). A hidden mechanism, reaction to specific actions, or connection to nearby areas. 1-2 sentences.",
        ),
      imagePrompt: z
        .string()
        .optional()
        .describe(
          "A visual description for image generation. Describe the scene in concrete visual terms — colors, lighting, materials, spatial layout, atmosphere. Focus on what makes THIS room visually distinct. Do not repeat the style prompt. 1-3 sentences.",
        ),
      returnExitName: z
        .string()
        .optional()
        .describe("Name for the return exit back to the source room (e.g. 'Narrow Stairway')."),
      returnExitDescription: z
        .string()
        .optional()
        .describe("Description for the return exit (e.g. 'Stone steps lead back down.')."),
      exitUpdate: z
        .object({
          name: z.string().optional().describe("New name for the exit, if it should change."),
          description: z
            .string()
            .optional()
            .describe("New description for the exit, if it should change."),
        })
        .optional()
        .describe("Optional changes to the exit the player came through."),
      additionalExits: z
        .array(
          z.object({
            direction: z.string(),
            name: z.string(),
            description: z.string(),
            destinationIntent: z
              .string()
              .optional()
              .describe(
                "What this exit should lead to when materialized. Omit if using connectTo.",
              ),
            connectTo: z
              .string()
              .optional()
              .describe(
                "ID of an existing adjacent room to connect to instead of creating an unresolved exit.",
              ),
            backExitName: z
              .string()
              .optional()
              .describe("When using connectTo: name for the return exit on the connected room."),
            backExitDescription: z
              .string()
              .optional()
              .describe(
                "When using connectTo: description for the return exit on the connected room.",
              ),
            aliases: z.array(z.string()),
            properties: propsSchema,
          }),
        )
        .describe(
          "Additional exits (not the return exit). 0-2 exits. Use connectTo OR destinationIntent.",
        ),
      contents: z
        .array(
          z.object({
            idSlug: z.string(),
            idCategory: z.string(),
            name: z.string(),
            description: z.string(),
            tags: z.array(z.string()),
            aliases: z.array(z.string()),
            properties: propsSchema,
          }),
        )
        .describe("Objects/NPCs in the new room. Keep sparse, 0-2 items."),
    }),
  });
}
