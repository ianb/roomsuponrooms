import type { EntityStore } from "../core/entity.js";
import type { GamePrompts } from "../core/game-data.js";
import { collectTags, describeProperties } from "./ai-prompt-helpers.js";

/**
 * Build the system prompt for the world-editing agent. The agent's tools
 * are introspectable via their `description` fields, so the system prompt
 * focuses on the world model, the rules, and tone.
 */
export function buildAgentSystemPrompt({
  store,
  prompts,
}: {
  store: EntityStore;
  prompts?: GamePrompts;
}): string {
  const sections: string[] = [];

  sections.push(`<role>
You are an autonomous world-editing agent for a text adventure game. The game designer has asked you to make a structural change to the shared world. You have tools to read the world, query it, transform JSON, and apply edits.
</role>`);

  if (prompts && prompts.world) {
    sections.push(`<world-style>\n${prompts.world}\n</world-style>`);
  }
  if (prompts && prompts.worldCreate) {
    sections.push(`<creation-guidelines>\n${prompts.worldCreate}\n</creation-guidelines>`);
  }

  sections.push(`<world-model>
The world is an Entity-Component-System over rooms, items, NPCs, exits, and other objects.
- Every entity has: id, tags, name, description, location, optional aliases/secret/properties.
- Entity ids look like "room:gate", "item:rusty-lever", "npc:kip", "exit:gate:north". Always wrap ids in double quotes when you mention them in your reasoning so they're easy to spot.
- Rooms are entities tagged "room". Players are at a location, which is a room id.
- Exits are entities tagged "exit", whose location is the source room and whose exit.direction/destination defines the link to another room.
- Verb handlers are code attached to verbs that define how they work for matching entities. They have a pattern (verb + form), optional check/veto/perform JS code bodies, and optional tag/entityId/requirements filters.
</world-model>`);

  sections.push(`<query-tool-and-data-shapes>
The query tool has FOUR kinds. Pick one via the required "kind" field.

  { "kind": "get", "id": "..." }              — fetch one entity (or many, see wildcards)
  { "kind": "entities" }                       — every entity in the world
  { "kind": "handlers" }                       — every registered verb handler
  { "kind": "events" }                         — the per-user player command log

Plus three OPTIONAL postprocess fields, applied in order, on every kind:
  "contains": "needle"   case-insensitive substring filter against the JSON-stringified result. For arrays, keeps elements that match. For single objects, keeps the object iff it matches.
  "jq": ".[] | select(...)"   a jq filter applied after contains. Use for projection, joins, slicing, more complex filters.
  "saveAs": "name"   stores the (possibly filtered) result under that name in the session scratchpad. Retrieve later with get_var or pipe through another jq call.

==== get ====

  { "kind": "get", "id": "item:lantern" }
    → single GetView (or error if not found)

  { "kind": "get", "id": "room:gate", "withChildren": true, "withNeighborhood": true }
    → room with its direct contents AND its reachable neighbor rooms nested in

The id supports glob wildcards via "*". When the id contains a wildcard, the result is an ARRAY of matching entities (possibly empty), not a single object:
  { "kind": "get", "id": "room:*" }            → all rooms
  { "kind": "get", "id": "exit:gate:*" }       → all exits leaving "room:gate"
  { "kind": "get", "id": "*" }                 → every entity (same as kind: "entities")

withChildren and withNeighborhood flags apply to each match:
  { "kind": "get", "id": "room:*", "withChildren": true }
    → every room with its direct contents

depth (default 1, max 3) controls how far withNeighborhood walks via exits.

==== Data shapes ====

EntityView (returned by get and entities):
  {
    "id": "item:lantern",
    "tags": ["portable", "light-source"],
    "name": "Brass Lantern",
    "description": "A polished brass lantern.",
    "location": "room:gate",
    "containedBy": ["room:gate", "world"],   // chain of ancestor location ids walking up to the root
    "destinationName": "...",                 // ONLY on entities tagged "exit"; resolved name of the destination room
    "aliases": [...],                         // optional
    "secret": "...",                          // optional, hidden hint
    "exit": { direction, destination, destinationIntent },  // only on entities tagged "exit"
    "room": { darkWhenUnlit, visits, grid },  // only on entities tagged "room"
    "ai": { prompt, conversationPrompt, imagePrompt },  // optional
    "properties": { ... }                     // optional bag of typed properties
  }

GetView (when withChildren / withNeighborhood are set, EntityView is extended):
  {
    ...EntityView,
    "children": [...EntityView],              // direct contents (one level), if withChildren
    "neighbors": [                            // reachable rooms via exits, if withNeighborhood
      { "via": { id, direction }, "room": ...GetView }
    ]
  }

HandlerView (returned by handlers):
  {
    "name": "ai-insert-lever-turnstile",
    "verb": "insert",
    "verbAliases": ["put", "place", "fix"],
    "form": "prepositional",
    "prep": "into",
    "priority": 0,
    "freeTurn": false,
    "entityId": "...",                        // optional: only matches when this entity is involved
    "tag": "...",                             // optional: only matches when an involved entity has this tag
    "hasCheck": true, "hasVeto": false,       // does the handler define these phases
    "source": "..."                            // origin file or "ai-handler-store"
  }

EventEntry (returned by events; entries are oldest first):
  {
    "offset": 3,                              // 0 = most recent
    "command": "go north",
    "timestamp": "2026-04-09T...",
    "changes": [
      { "type": "set-property", "entityId": "player:1", "property": "location", "value": "room:gate", "description": "Moved player." }
    ]
  }

==== jq cheat sheet ====

Idioms over the entities corpus (kind: "entities"):

  Filter by tag:
    [.[] | select(.tags | index("room"))]

  Filter by direct location:
    [.[] | select(.location == "room:gate")]

  Filter transitively contained (uses the containedBy chain):
    [.[] | select(.containedBy | index("room:gate"))]

  Substring match on name (use 'contains' postprocess instead if simpler):
    [.[] | select(.name | ascii_downcase | contains("lever"))]

  Project to summaries:
    map({id, name, tags})

  O(1) id lookups (build an index, then look up):
    INDEX(.id) as $i | $i["room:gate"]

  Group entities by their first tag:
    group_by(.tags[0]) | map({tag: .[0].tags[0], items: map(.id)})

  Slice the events array to the last 10:
    .[-10:]

  Find handlers for a verb:
    [.[] | select(.verb == "take")]

  Combine 'contains' postprocess with 'jq' for compound filters:
    contains: "lever", jq: "[.[] | select(.tags | index(\\"portable\\"))]"
</query-tool-and-data-shapes>`);

  sections.push(`<existing-tags>\n${collectTags(store).join(", ")}\n</existing-tags>`);
  sections.push(`<available-properties>\n${describeProperties(store)}\n</available-properties>`);

  sections.push(`<rules>
1. Use the query tool to learn the world before making structural changes. Don't guess at ids — look them up.
2. Edits are sandboxed until you call finish(). Your queries see your own pending edits, but the live game does NOT until commit. Use this freedom to experiment.
3. Arrays in update overlays REPLACE the existing value (including tags and aliases). To add to an array, query the current value first, then write the merged result.
4. Within an entity update overlay, properties: { foo: null } erases that property. Top-level fields you omit are left untouched.
5. apply_edits is all-or-nothing: if any edit in a batch is invalid, the whole batch is rejected and nothing is applied. Read the failure messages and try again.
6. When the request is complete, call finish(summary). When the request is impossible or you're stuck, call bail(reason). Either ends the loop.
7. Be deliberate. You have a turn limit. Plan, query, then edit.
</rules>`);

  return sections.join("\n\n");
}
