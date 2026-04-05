import type { ParsedCommand } from "./verb-types.js";

/** Prompt layers for AI guidance — style, tone, constraints */
export interface GamePrompts {
  /** General world style/tone prompt */
  world?: string;
  /** Additional guidance for verb fallback AI */
  worldVerb?: string;
  /** Additional guidance for entity creation AI */
  worldCreate?: string;
  /** Additional guidance for NPC conversation AI */
  worldConversation?: string;
}

/** Top-level game data file format — loaded from JSON */
export interface GameData {
  meta: {
    slug: string;
    title: string;
    description: string;
    /** Seed for the random number generator (default: 1) */
    seed?: number;
    /** Theme name for visual styling (default: none/site default) */
    theme?: string;
    /** Custom messages shown while AI is generating — one picked per request */
    aiThinkingMessages?: string[];
    /** Hidden games are playable but not listed on the homepage */
    hidden?: boolean;
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
  /** If true, unknown words are always rejected — no AI fallback */
  closed?: boolean;
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

/** Entity definition in data format (matches JSONL file structure) */
export interface EntityData {
  id: string;
  tags: string[];
  name: string;
  description: string;
  location: string;
  aliases?: string[];
  secret?: string;
  scenery?: Array<{ word: string; aliases?: string[]; description: string; rejection: string }>;
  exit?: {
    direction: string;
    destination?: string;
    destinationIntent?: string;
  };
  room?: {
    darkWhenUnlit?: boolean;
    visits?: number;
    grid?: { x: number; y: number; z: number };
  };
  ai?: {
    prompt?: string;
    conversationPrompt?: string;
  };
  properties?: Record<string, unknown>;
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
