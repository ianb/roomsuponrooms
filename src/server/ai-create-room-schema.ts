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
    notes: z
      .string()
      .describe("Your reasoning about this room. Shown to the designer, not the player."),
  });
}
