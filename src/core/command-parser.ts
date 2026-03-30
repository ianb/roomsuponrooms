import type { ParsedCommand } from "./verb-types.js";

// --- Preposition groups ---

export const PREP_GROUPS: Record<string, string[]> = {
  containment: ["in", "into", "inside"],
  surface: ["on", "onto"],
  target: ["to", "toward", "towards"],
  instrument: ["with", "using"],
  source: ["from", "out of"],
  direction: ["at", "toward", "towards"],
  beneath: ["under", "beneath", "below"],
};

export function resolvePrep(prep: string): string {
  for (const [group, members] of Object.entries(PREP_GROUPS)) {
    if (members.includes(prep)) return group;
  }
  return prep;
}

// --- Prepositions ---

const PREPOSITIONS = new Set([
  "in",
  "on",
  "off",
  "to",
  "with",
  "at",
  "from",
  "under",
  "into",
  "onto",
]);

// --- Compound verbs (two-word verbs treated as a single verb) ---

const COMPOUND_VERBS = new Set(["turn on", "turn off", "pick up", "put on", "take off"]);

// --- Parser ---

export function parseCommand(input: string): ParsedCommand | null {
  const words = input.trim().toLowerCase().split(/\s+/);
  if (words.length === 0) return null;

  let verb = words[0];
  if (!verb) return null;

  // Check for compound verbs (e.g. "turn on lamp" → verb="turn-on", object="lamp")
  let verbWordCount = 1;
  if (words.length >= 2) {
    const compound = `${words[0]} ${words[1]}`;
    if (COMPOUND_VERBS.has(compound)) {
      verb = `${words[0]}-${words[1]}`;
      verbWordCount = 2;
    }
  }

  const rest = words.slice(verbWordCount);
  if (rest.length === 0) {
    return { form: "intransitive", verb };
  }

  for (let i = 0; i < rest.length; i++) {
    const word = rest[i];
    if (word && PREPOSITIONS.has(word)) {
      const before = rest.slice(0, i).join(" ");
      const after = rest.slice(i + 1).join(" ");

      if (!after) return null;

      if (before) {
        return { form: "ditransitive", verb, object: before, prep: word, indirect: after };
      }
      return { form: "prepositional", verb, prep: word, object: after };
    }
  }

  const object = rest.join(" ");
  return { form: "transitive", verb, object };
}
