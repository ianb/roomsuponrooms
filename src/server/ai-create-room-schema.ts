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
];

export function buildRoomSchema(store: EntityStore) {
  const propsSchema = buildPropertiesSchema(store, { exclude: ROOM_EXCLUDED });
  return z.object({
    room: z.object({
      idSlug: z.string().describe("Short kebab-case slug for the room ID."),
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
              .describe("What this exit should lead to when materialized."),
            aliases: z.array(z.string()),
            properties: propsSchema,
          }),
        )
        .describe("Additional unresolved exits (not the return exit). 0-2 exits."),
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
    notes: z
      .string()
      .describe("Your reasoning about this room. Shown to the designer, not the player."),
  });
}
