import { z } from "zod";

// --- Entity payload schemas ---

const sceneryEntrySchema = z.object({
  word: z.string(),
  aliases: z.array(z.string()).optional(),
  description: z.string(),
  rejection: z.string(),
});

const exitSchema = z.object({
  direction: z.string(),
  destination: z.string().optional(),
  destinationIntent: z.string().optional(),
});

const roomSchema = z.object({
  darkWhenUnlit: z.boolean().optional(),
  visits: z.number().optional(),
  grid: z
    .object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
    })
    .optional(),
});

const aiSchema = z.object({
  prompt: z.string().optional(),
  conversationPrompt: z.string().optional(),
  imagePrompt: z.string().optional(),
});

/**
 * Full EntityData required for `create` ops. Mirrors the EntityData interface
 * in src/core/game-data.ts. `properties` is an arbitrary record.
 */
const entityCreateSchema = z.object({
  tags: z.array(z.string()),
  name: z.string(),
  description: z.string(),
  location: z.string(),
  aliases: z.array(z.string()).optional(),
  secret: z.string().optional(),
  scenery: z.array(sceneryEntrySchema).optional(),
  exit: exitSchema.optional(),
  room: roomSchema.optional(),
  ai: aiSchema.optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Partial EntityData for `update` ops. Every top-level field is optional;
 * `properties` entries with `null` value erase that property.
 */
const entityUpdateSchema = z.object({
  tags: z.array(z.string()).optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  secret: z.string().optional(),
  scenery: z.array(sceneryEntrySchema).optional(),
  exit: exitSchema.optional(),
  room: roomSchema.optional(),
  ai: aiSchema.optional(),
  properties: z.record(z.string(), z.unknown().nullable()).optional(),
});

// --- Handler payload schemas ---

const handlerPatternSchema = z.object({
  verb: z.string(),
  verbAliases: z.array(z.string()).optional(),
  form: z.enum(["intransitive", "transitive", "prepositional", "ditransitive"]),
  prep: z.string().optional(),
});

const requirementsSchema = z.object({
  tags: z.array(z.string()).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

const handlerCreateSchema = z.object({
  pattern: handlerPatternSchema,
  priority: z.number().optional(),
  freeTurn: z.boolean().optional(),
  entityId: z.string().optional(),
  tag: z.string().optional(),
  objectRequirements: requirementsSchema.optional(),
  indirectRequirements: requirementsSchema.optional(),
  check: z.string().optional(),
  veto: z.string().optional(),
  perform: z.string(),
});

const handlerUpdateSchema = handlerCreateSchema.partial();

// --- Edit envelope ---
//
// Flat schema with no discriminated unions. Each edit has a `target` (the
// entity id or handler name) and exactly ONE of six optional operation
// fields. The runner detects which is set and routes accordingly. Earlier
// versions used nested discriminators ({entity: {create|value|delete}})
// which Gemini Flash couldn't reliably navigate — it would put `name`
// inside `create` instead of as a sibling, or omit the `entity` wrapper.
// The flat shape sidesteps that entirely.

export const editSchema = z.object({
  target: z
    .string()
    .describe(
      'The entity id (for entity edits, e.g. "item:rusty-sword") or handler name (for handler edits, e.g. "ai-shout-room"). Required for every edit.',
    ),
  entityCreate: entityCreateSchema
    .optional()
    .describe(
      'Set this to create a new entity. Provide the FULL EntityData object. Example: {"target": "item:lantern", "entityCreate": {"tags": ["portable"], "name": "Brass Lantern", "description": "...", "location": "room:gate"}}',
    ),
  entityUpdate: entityUpdateSchema
    .optional()
    .describe(
      'Set this to update an existing entity with a partial overlay. Top-level fields you omit are left untouched; properties with null erase. Example: {"target": "item:lantern", "entityUpdate": {"properties": {"lit": true}}}',
    ),
  entityDelete: z
    .boolean()
    .optional()
    .describe(
      'Set to true to delete an existing entity. Example: {"target": "item:trash", "entityDelete": true}',
    ),
  handlerCreate: handlerCreateSchema
    .optional()
    .describe(
      'Set this to create a new verb handler. Provide pattern + perform code body at minimum. Example: {"target": "ai-shout", "handlerCreate": {"pattern": {"verb": "shout", "form": "intransitive"}, "perform": "return { output: \'Your voice echoes.\', events: [] };"}}',
    ),
  handlerUpdate: handlerUpdateSchema
    .optional()
    .describe(
      'Set this to update an existing handler with a partial overlay. Example: {"target": "ai-shout", "handlerUpdate": {"perform": "return { output: \'Updated.\', events: [] };"}}',
    ),
  handlerDelete: z
    .boolean()
    .optional()
    .describe(
      'Set to true to delete an existing handler. Example: {"target": "ai-shout", "handlerDelete": true}',
    ),
});

export const editBatchSchema = z.object({
  edits: z
    .array(editSchema)
    .min(1)
    .describe(
      "A batch of one or more edits. Each edit must have exactly ONE operation field set (entityCreate, entityUpdate, entityDelete, handlerCreate, handlerUpdate, or handlerDelete). The whole batch is rejected if any edit fails validation.",
    ),
});

export type EditInput = z.infer<typeof editSchema>;
export type EditBatchInput = z.infer<typeof editBatchSchema>;

export { entityCreateSchema, entityUpdateSchema, handlerCreateSchema, handlerUpdateSchema };
