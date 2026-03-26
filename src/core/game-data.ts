import type { ParsedCommand } from "./verb-types.js";

/** Prompt layers for AI guidance — style, tone, constraints */
export interface GamePrompts {
  /** General world style/tone prompt */
  world?: string;
  /** Additional guidance for verb fallback AI */
  worldVerb?: string;
  /** Additional guidance for entity creation AI */
  worldCreate?: string;
}

/** Top-level game data file format — loaded from JSON */
export interface GameData {
  meta: {
    slug: string;
    title: string;
    description: string;
    /** Seed for the random number generator (default: 1) */
    seed?: number;
  };
  prompts?: GamePrompts;
  properties?: PropertyData[];
  entities: EntityData[];
  handlers?: HandlerData[];
  /** NPC conversation data, keyed by entity ID */
  conversations?: Record<string, ConversationFileData>;
}

/** Conversation data as loaded from a game file */
export interface ConversationFileData {
  npcId: string;
  words: WordEntryData[];
}

/** Word entry as stored in game data files */
export interface WordEntryData {
  word: string;
  aliases?: string[];
  conditions?: {
    context?: string;
    first?: boolean;
    properties?: Record<string, unknown>;
  };
  narration: string;
  response: string;
  effects?: Array<{
    type: "set-property" | "move" | "close-conversation";
    entityId?: string;
    property?: string;
    value?: unknown;
    from?: string;
    description?: string;
  }>;
  highlights?: string[];
  perform?: string;
}

/** Property definition in data format (mirrors PropertyDefinition) */
export interface PropertyData {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  unit?: string;
  defaultValue?: unknown;
}

/** Entity definition in data format */
export interface EntityData {
  id: string;
  tags: string[];
  properties: Record<string, unknown>;
}

/**
 * Verb handler in data format.
 *
 * Code strings receive these variables:
 *   lib     — HandlerLib instance with helper methods
 *   object  — direct object entity (or null for intransitive)
 *   indirect — indirect object entity (or null)
 *   player  — player entity
 *   room    — current room entity
 *   store   — EntityStore
 *   command — full ResolvedCommand
 */
export interface HandlerData {
  name: string;
  pattern: {
    verb: string;
    verbAliases?: string[];
    form: ParsedCommand["form"];
    prep?: string;
  };
  priority?: number;
  freeTurn?: boolean;
  entityId?: string;
  tag?: string;
  objectRequirements?: { tags?: string[]; properties?: Record<string, unknown> };
  indirectRequirements?: { tags?: string[]; properties?: Record<string, unknown> };
  /** Code returning boolean (true = handler applies) */
  check?: string;
  /** Code returning string (block message) or null (no block) */
  veto?: string;
  /** Code returning { output: string, events: WorldEvent[] } */
  perform: string;
}
