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

  sections.push(`<query-tool-tips>
The query tool is your main way to learn the world. The input is always a single flat object: a required "kind" string plus the fields that kind needs as siblings. Concrete examples:

  { "kind": "getRoom", "id": "room:gate" }
  { "kind": "getRoom", "id": "room:gate", "deep": true }
  { "kind": "getNeighborhood", "id": "room:gate", "depth": 2 }
  { "kind": "get", "id": "item:rusty-lever" }
  { "kind": "findByTag", "tag": "npc" }
  { "kind": "findByTag", "tag": "portable", "at": "room:gate" }
  { "kind": "findByName", "name": "lever" }
  { "kind": "getContents", "id": "item:chest" }
  { "kind": "listRooms" }
  { "kind": "listHandlers" }
  { "kind": "getHandler", "name": "ai-insert-lever-turnstile" }
  { "kind": "findEvents", "latest": 10 }

Notes on the kinds:
- "getRoom" returns the room plus its exits (each with destinationName resolved) and a shallow {id,name,tags} list of contents. Pass deep:true for full entity views of the contents.
- "getNeighborhood" returns the center room plus the rooms reachable through its exits. depth defaults to 1; use 2 or 3 to plan multi-room puzzles.
- "findByTag" with the optional "at" field scopes to a single location.
- "findByName" matches a case-insensitive substring against names and aliases.
- "findEvents" reads the per-user player command log so you can react to what just happened.

Every query also supports two optional sibling fields:
  "jq":     a jq filter applied to the result before returning. Use this to project, slice, or filter large results in one call.
  "saveAs": a name. The (possibly jq-filtered) result is persisted under that name in the session scratchpad for later get_var or jq calls.

Examples combining them:
  { "kind": "findByTag", "tag": "room", "jq": ".results | map(.id)" }
  { "kind": "listRooms", "saveAs": "world_map" }
  { "kind": "getRoom", "id": "room:gate", "jq": ".exits | map({direction, destination})" }
</query-tool-tips>`);

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
