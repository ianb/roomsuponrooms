import type { Entity } from "./entity.js";

/** A single word entry in an NPC's conversation data */
export interface WordEntry {
  /** The trigger word */
  word: string;
  /** Local aliases (conversation-scoped synonyms) */
  aliases?: string[];
  /** Conditions that must be met for this entry to match */
  conditions?: WordConditions;
  /** What the player "really said" (quoted if literal speech) */
  narration: string;
  /** The NPC's response (quoted if spoken, plain narration for actions) */
  response: string;
  /** Static effects to apply */
  effects?: WordEffect[];
  /** 0-2 topic words to highlight/reveal */
  highlights?: string[];
  /** JS code for conditional logic (can override narration, response, effects) */
  perform?: string;
}

export interface WordConditions {
  /** Must have been talking about this word previously */
  context?: string;
  /** Only matches on the very first exchange */
  first?: boolean;
  /** Arbitrary property checks on the NPC entity */
  properties?: Record<string, unknown>;
}

export interface WordEffect {
  type: "set-property" | "move" | "close-conversation";
  entityId?: string;
  property?: string;
  value?: unknown;
  from?: string;
  description?: string;
}

/** Full conversation data for an NPC, stored in a separate JSONL file */
export interface ConversationData {
  words: WordEntry[];
  /** If true, unknown words are always rejected — no AI fallback */
  closed?: boolean;
}

/** In-memory state of an active conversation */
export interface ConversationState {
  /** Which NPC we're talking to */
  npcId: string;
  /** The last word used (for context conditions) */
  currentWord: string | null;
  /** All words the player has used in this session */
  seenWords: Set<string>;
  /** Words revealed via highlights (available topics) */
  knownWords: Set<string>;
}

/** Result of processing a conversation word */
export interface ConversationResult {
  /** Combined narration + response text */
  output: string;
  /** Events to apply to the store */
  events: WordEffect[];
  /** Whether the conversation should end */
  closeConversation: boolean;
  /** Currently known topic words (for UI highlighting) */
  knownWords: string[];
  /** Notes for debug */
  notes?: string;
}

export type RejectionType = "no-words" | "no-response";

export class ConversationNoMatchError extends Error {
  constructor(
    public readonly word: string,
    public readonly rejectionType: RejectionType,
  ) {
    super(`No match for word: ${word}`);
    this.name = "ConversationNoMatchError";
  }
}

/** Start a new conversation, returning the greeting result */
export function startConversation(
  data: ConversationData,
  { npc }: { npc: Entity },
): { state: ConversationState; greeting: ConversationResult } {
  const state: ConversationState = {
    npcId: npc.id,
    currentWord: null,
    seenWords: new Set(),
    knownWords: new Set(),
  };

  // Look for a "first" entry as the greeting
  const firstEntry = data.words.find((w) => w.conditions && w.conditions.first === true);

  if (firstEntry) {
    const result = applyWordEntry(firstEntry, state);
    return { state, greeting: result };
  }

  // No explicit greeting — just show available topics
  const npcName = (npc.properties["name"] as string) || npc.id;
  const allTopics = collectAllTopics(data);
  for (const t of allTopics) {
    state.knownWords.add(t);
  }
  return {
    state,
    greeting: {
      output: `You are now talking to ${npcName}.`,
      events: [],
      closeConversation: false,
      knownWords: Array.from(state.knownWords),
    },
  };
}

/** Process a single word in an active conversation */
export function processWord(
  data: ConversationData,
  { word, npc, state }: { word: string; npc: Entity; state: ConversationState },
): ConversationResult {
  const normalized = word.toLowerCase().trim();

  // Help: show known words
  if (normalized === "help") {
    const seen = Array.from(state.seenWords);
    const known = Array.from(state.knownWords);
    const all = Array.from(new Set([...seen, ...known])).toSorted();
    const npcName = (npc.properties["name"] as string) || npc.id;
    const output =
      all.length > 0
        ? `Topics for ${npcName}: ${all.join(", ")}`
        : "You haven't discovered any topics yet.";
    return {
      output,
      events: [],
      closeConversation: false,
      knownWords: Array.from(state.knownWords),
    };
  }

  // Bye/leave: always exit
  if (normalized === "bye" || normalized === "leave") {
    const byeEntry = findMatchingEntry(normalized, { entries: data.words, state, npc });
    if (byeEntry) {
      state.seenWords.add(normalized);
      const result = applyWordEntry(byeEntry, state);
      result.closeConversation = true;
      return result;
    }
    return {
      output: "You end the conversation.",
      events: [],
      closeConversation: true,
      knownWords: Array.from(state.knownWords),
    };
  }

  // Match against word entries
  const entry = findMatchingEntry(normalized, { entries: data.words, state, npc });
  if (!entry) {
    throw new ConversationNoMatchError(normalized, "no-response");
  }

  state.seenWords.add(normalized);
  state.currentWord = normalized;
  return applyWordEntry(entry, state);
}

/** Find the best matching word entry, respecting conditions */
function findMatchingEntry(
  word: string,
  { entries, state, npc }: { entries: WordEntry[]; state: ConversationState; npc: Entity },
): WordEntry | null {
  // Find all entries where word matches (by word or alias)
  const candidates = entries.filter((e) => {
    if (!e.word) return false;
    if (e.word.toLowerCase() === word) return true;
    if (e.aliases && e.aliases.some((a) => a.toLowerCase() === word)) return true;
    return false;
  });

  // Filter by conditions
  const applicable = candidates.filter((e) => {
    if (!e.conditions) return true;
    if (e.conditions.first === true) return false;
    if (e.conditions.context && state.currentWord !== e.conditions.context) return false;
    if (e.conditions.properties) {
      for (const [key, val] of Object.entries(e.conditions.properties)) {
        if (npc.properties[key] !== val) return false;
      }
    }
    return true;
  });

  if (applicable.length === 0) return null;

  // Sort by specificity: context > properties > unconditional
  const sorted = applicable.toSorted((a, b) => {
    return conditionSpecificity(b.conditions) - conditionSpecificity(a.conditions);
  });

  return sorted[0] || null;
}

function conditionSpecificity(cond: WordConditions | undefined): number {
  if (!cond) return 0;
  let score = 0;
  if (cond.context) score += 2;
  if (cond.properties) score += Object.keys(cond.properties).length;
  return score;
}

/** Apply a word entry, returning the conversation result */
function applyWordEntry(entry: WordEntry, state: ConversationState): ConversationResult {
  const parts: string[] = [];
  if (entry.narration) parts.push(entry.narration);
  if (entry.response) parts.push(entry.response);

  // Add highlights to known words
  const highlights = entry.highlights || [];
  for (const h of highlights) {
    state.knownWords.add(h.toLowerCase());
  }

  const hasClose = entry.effects && entry.effects.some((e) => e.type === "close-conversation");

  return {
    output: parts.join("\n"),
    events: entry.effects || [],
    closeConversation: !!hasClose,
    knownWords: Array.from(state.knownWords),
  };
}

/** Collect all topic words from conversation data */
function collectAllTopics(data: ConversationData): string[] {
  const topics = new Set<string>();
  for (const entry of data.words) {
    if (entry.word && (!entry.conditions || !entry.conditions.first)) {
      topics.add(entry.word.toLowerCase());
    }
  }
  return Array.from(topics);
}

/** Highlight known topic words in text by wrapping them in [[word]] markers */
export function highlightTopics(text: string, knownWords: string[]): string {
  if (knownWords.length === 0) return text;

  // Build a regex that matches any known word as a whole word, case-insensitive
  const escaped = knownWords.map((w) => w.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&"));
  // eslint-disable-next-line security/detect-non-literal-regexp -- words are escaped above
  const pattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");

  // Don't highlight inside existing markers
  return text.replace(pattern, (match) => {
    return `[[${match}]]`;
  });
}
