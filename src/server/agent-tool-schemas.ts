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
  texture: z
    .enum(["sparse", "plain", "rich"])
    .optional()
    .describe(
      "Pacing intent: how generous AI improvisation is here. sparse = connective tissue (mundane scenery, no inspection chains), plain = modest, rich = rewards deep exploration. Unset = derived procedurally.",
    ),
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

// --- Conversation payload schema ---

// Gemini's function-calling schema dialect cannot express untyped values —
// a z.unknown() named property serializes to an empty schema and the model
// returns EMPTY completions (observed: a 22-turn stall of blank responses).
// Effect/condition values are scalars in practice, so type them as such.
const scalarValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const wordConditionsSchema = z.object({
  context: z
    .string()
    .optional()
    .describe("Only matches when the previous word in the conversation was this one."),
  first: z
    .boolean()
    .optional()
    .describe("Greeting entry: only used when the conversation starts, never matched as a word."),
  properties: z
    .record(z.string(), scalarValueSchema)
    .optional()
    .describe("Only matches when the NPC entity has these property values."),
});

const wordEffectSchema = z.object({
  type: z
    .enum(["set-property", "move", "close-conversation"])
    .describe(
      'set-property: set a property on an entity. move: requires property:"location" and value:<destination id> to relocate an entity. close-conversation: end the conversation after this word.',
    ),
  entityId: z.string().optional().describe("Target entity. Defaults to the NPC itself."),
  property: z.string().optional(),
  value: scalarValueSchema.optional(),
  from: z.string().optional(),
  description: z.string().optional(),
});

const conversationSetSchema = z.object({
  word: z.string().describe("The trigger word the player says. Matching is EXACT (or an alias)."),
  aliases: z.array(z.string()).optional(),
  conditions: wordConditionsSchema.optional(),
  narration: z.string().describe('What the player "really said", e.g. "You ask about the chest."'),
  response: z.string().describe("The NPC's reply (quoted speech) or reaction."),
  effects: z.array(wordEffectSchema).optional(),
  highlights: z
    .array(z.string())
    .optional()
    .describe("0-2 topic words this reply reveals as new conversation topics."),
  perform: z
    .string()
    .optional()
    .describe("Optional JS body for conditional logic; may override narration/response/effects."),
});

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
  conversationSet: conversationSetSchema
    .optional()
    .describe(
      'Set this to add or replace ONE conversation word entry on an NPC. The target is the NPC entity id (must be tagged "talkable"); entries are keyed by word, so setting an existing word replaces it. Example: {"target": "npc:guide", "conversationSet": {"word": "chest", "narration": "You ask about the chest.", "response": "\\"I can unlock it for you.\\"", "effects": [{"type": "set-property", "entityId": "item:chest", "property": "locked", "value": false}]}}',
    ),
});

export const editBatchSchema = z.object({
  edits: z
    .array(editSchema)
    .min(1)
    .describe(
      "A batch of one or more edits. Each edit must have exactly ONE operation field set (entityCreate, entityUpdate, entityDelete, handlerCreate, handlerUpdate, handlerDelete, or conversationSet). The whole batch is rejected if any edit fails validation.",
    ),
});

export type EditInput = z.infer<typeof editSchema>;
export type EditBatchInput = z.infer<typeof editBatchSchema>;

export type ConversationSetInput = z.infer<typeof conversationSetSchema>;

export { entityCreateSchema, entityUpdateSchema, handlerCreateSchema, handlerUpdateSchema };
