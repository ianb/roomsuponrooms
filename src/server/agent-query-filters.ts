/**
 * Post-processing for query results: simple first-class filters (the moves
 * agents make constantly, without needing jq) and summary compaction (long
 * prose truncated so list payloads stay cheap to read).
 */

export interface SimpleFilterInput {
  tag?: string;
  locatedIn?: string;
  nameContains?: string;
  verb?: string;
}

interface FilterableItem {
  tags?: unknown;
  location?: unknown;
  containedBy?: unknown;
  name?: unknown;
  aliases?: unknown;
  verb?: unknown;
  verbAliases?: unknown;
}

/**
 * Apply the simple filter fields to an array result. Each filter keeps items
 * that match; items lacking the relevant fields are dropped. Non-array
 * values pass through untouched (filters only make sense on lists).
 */
export function applySimpleFilters(value: unknown, input: SimpleFilterInput): unknown {
  if (!Array.isArray(value)) return value;
  let out = value as FilterableItem[];
  if (input.tag !== undefined) {
    const tag = input.tag;
    out = out.filter((it) => Array.isArray(it.tags) && it.tags.includes(tag));
  }
  if (input.locatedIn !== undefined) {
    const loc = input.locatedIn;
    out = out.filter(
      (it) =>
        it.location === loc || (Array.isArray(it.containedBy) && it.containedBy.includes(loc)),
    );
  }
  if (input.nameContains !== undefined) {
    const needle = input.nameContains.toLowerCase();
    out = out.filter((it) => {
      if (typeof it.name === "string" && it.name.toLowerCase().includes(needle)) return true;
      return (
        Array.isArray(it.aliases) &&
        it.aliases.some((a) => typeof a === "string" && a.toLowerCase().includes(needle))
      );
    });
  }
  if (input.verb !== undefined) {
    const verb = input.verb;
    out = out.filter(
      (it) => it.verb === verb || (Array.isArray(it.verbAliases) && it.verbAliases.includes(verb)),
    );
  }
  return out;
}

const SUMMARY_TEXT_LIMIT = 120;

/**
 * Compact one item of an array result for echoing into the conversation.
 * Long prose fields dominate list payloads (a full `entities` dump of the
 * base tinkermarket world is ~12k tokens, a third of it descriptions), and
 * the agent rarely needs full text for every list item — it can `get` the
 * one it cares about. Non-object items and unfamiliar shapes (e.g. after a
 * jq projection) pass through untouched. Nested children/neighbors views
 * are compacted recursively.
 */
export function compactListItem(item: unknown): unknown {
  if (item === null || typeof item !== "object" || Array.isArray(item)) return item;
  const obj = item as Record<string, unknown>;
  // Only compact things that look like entity views; jq projections and
  // handler views (no description) stay as-is.
  if (typeof obj["id"] !== "string" || typeof obj["description"] !== "string") return item;
  const out: Record<string, unknown> = { ...obj };
  for (const field of ["description", "secret"]) {
    const text = out[field];
    if (typeof text === "string" && text.length > SUMMARY_TEXT_LIMIT) {
      out[field] =
        `${text.slice(0, SUMMARY_TEXT_LIMIT)}… (${text.length} chars; get "${obj["id"]}" for full text)`;
    }
  }
  if (Array.isArray(out["scenery"]) && out["scenery"].length > 0) {
    const words = (out["scenery"] as Array<{ word?: string }>)
      .map((s) => s.word)
      .filter((w): w is string => typeof w === "string");
    out["scenery"] = `(${words.length} entries: ${words.join(", ")}; get "${obj["id"]}" for full)`;
  }
  if (out["ai"] !== undefined && out["ai"] !== null) {
    out["ai"] = `(present; get "${obj["id"]}" for full)`;
  }
  compactNestedInPlace(out);
  return out;
}

/**
 * Summarize the nested children/neighbors arrays of a single GetView while
 * leaving the top-level entity's own fields at full detail. `get X
 * withChildren` payloads are dominated by full child views otherwise.
 */
export function compactNested(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj["children"]) && !Array.isArray(obj["neighbors"])) return value;
  const out = { ...obj };
  compactNestedInPlace(out);
  return out;
}

function compactNestedInPlace(out: Record<string, unknown>): void {
  if (Array.isArray(out["children"])) {
    out["children"] = out["children"].map((c) => compactListItem(c));
  }
  if (Array.isArray(out["neighbors"])) {
    out["neighbors"] = (out["neighbors"] as Array<Record<string, unknown>>).map((n) => ({
      ...n,
      room: compactListItem(n["room"]),
    }));
  }
}
