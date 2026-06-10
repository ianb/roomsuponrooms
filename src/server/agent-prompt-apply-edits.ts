/**
 * The <apply-edits> section of the agent system prompt: the edit operation
 * vocabulary, verb form taxonomy, properties rules, and worked examples.
 * Split from agent-prompt-sections.ts purely for file-size reasons.
 */

export const APPLY_EDITS_SECTION = `<apply-edits>
The apply_edits tool takes a batch of edits. Each edit is a flat object with a 'target' (entity id, handler name, or npc id) and EXACTLY ONE of seven operation fields. Pick the field name that matches what you want to do — there is no separate kind/op enum to navigate.

  entityCreate     create a new entity (full payload)
  entityUpdate     update an existing entity (partial overlay; null erases properties)
  entityDelete     delete an existing entity (set to true)
  handlerCreate    create a new verb handler (pattern + perform body required)
  handlerUpdate    update an existing handler (partial overlay)
  handlerDelete    delete an existing handler (set to true)
  conversationSet  add or replace ONE conversation word entry on an NPC (target = npc id)

The whole batch is rejected if any edit fails validation; nothing is half-applied. Edits become visible to your subsequent query/playtest calls but only commit to the live world when you call finish().

==== Verb form taxonomy ====

The 'pattern.form' field tells the dispatcher how a player must phrase the command. PICK THE RIGHT FORM — the dispatcher will not match a handler whose form differs from the parsed command. The parser uses these four shapes (a "prep" is one of: in, on, off, to, with, at, from, under, into, onto):

  intransitive    "verb"                       e.g. "look", "wait", "shout"
  transitive      "verb obj"                    e.g. "take lever", "examine turnstile"
  prepositional   "verb prep obj"               e.g. "look at door", "wait for kip",
                                                "talk to npc". Exactly one object,
                                                preceded by the prep. The handler's
                                                'prep' field names the preposition.
  ditransitive    "verb obj prep obj"           e.g. "put lever in turnstile",
                                                "insert key into lock", "give map to kip",
                                                "use key on lock". Two objects with the
                                                preposition BETWEEN them. The first noun
                                                phrase is the direct 'object', the second
                                                is the 'indirect'. Despite the name,
                                                ditransitive is the COMMON form for
                                                X-on-Y / X-in-Y interactions.

KEY DISTINCTION: if the player says one noun before the preposition AND another after it ("put X in Y"), the parser produces a DITRANSITIVE command, not prepositional. Prepositional is only for "verb prep obj" with a single noun phrase after the preposition. Two-object commands are ditransitive even when they feel like a single action.

So a handler for "put lever in turnstile" or "insert lever into socket" must have:
  { pattern: { verb: "put", form: "ditransitive", prep: "in" } }
not form: "prepositional".

Preps match by GROUP: in/into/inside are interchangeable, as are on/onto, to/toward, with/using, from/"out of", under/beneath/below. A handler with prep "in" matches "put X into Y" automatically. VERBS DO NOT have groups — "put" does not match "insert" unless you list it in verbAliases. Always cover the synonyms a player would plausibly type (put/insert/place/stick, etc.), and ALWAYS include the exact verb used in the request.

Inside a ditransitive handler's perform/check body, 'object' is the direct object (the lever) and 'indirect' is the indirect object (the turnstile).

==== Properties ====

Property names you set in entityCreate/entityUpdate payloads or read in handler perform bodies MUST come from the registered <available-properties> list below. You cannot create new property names ad-hoc — apply_edits will reject any payload that uses an unregistered name. If you need state that doesn't fit any existing property, you have to either repurpose one or rethink the design.

==== Worked examples ====

Create a portable item in a room:
  {
    "edits": [
      {
        "target": "item:rusty-key",
        "entityCreate": {
          "tags": ["portable"],
          "name": "Rusty Key",
          "description": "An old iron key, pitted with rust.",
          "location": "room:gate",
          "aliases": ["key", "iron key"]
        }
      }
    ]
  }

Update an entity (only the fields you want to change):
  {
    "edits": [
      {
        "target": "item:lantern",
        "entityUpdate": {
          "description": "A polished brass lantern, freshly lit.",
          "properties": { "lit": true }
        }
      }
    ]
  }

Delete an entity:
  { "edits": [ { "target": "item:trash", "entityDelete": true } ] }

Create a new verb handler. Pattern needs verb + form (one of "intransitive", "transitive", "prepositional", "ditransitive"). The 'perform' code body returns { output, events } and has access to lib, object, indirect, player, room, store. Use lib.ref(entity) to embed an entity reference in the output text:
  {
    "edits": [
      {
        "target": "ai-shout",
        "handlerCreate": {
          "pattern": { "verb": "shout", "form": "intransitive", "verbAliases": ["yell", "holler"] },
          "perform": "return { output: 'Your voice echoes through the trees, startling some unseen birds.', events: [] };"
        }
      }
    ]
  }

A handler bound to a specific entity (only fires when that entity is the direct object). Note the form is "ditransitive" — the player will type "insert lever into turnstile" or "put lever in turnstile", which has TWO noun phrases with the prep between them. verbAliases cover the synonyms a player would try:
  {
    "edits": [
      {
        "target": "ai-insert-lever-turnstile",
        "handlerCreate": {
          "pattern": { "verb": "put", "verbAliases": ["insert", "place", "stick", "jam"], "form": "ditransitive", "prep": "in" },
          "entityId": "item:rusty-lever",
          "perform": "if (indirect.id !== 'item:stuck-turnstile') return { output: 'You cannot insert the lever there.', events: [] }; const exit = store.get('exit:gate:north'); exit.properties.locked = false; return { output: 'The lever clicks home and the turnstile rotates. The way north is clear.', events: [{ type: 'set-property', entityId: 'exit:gate:north', property: 'locked', value: false, description: 'Unlocked the gate.' }] };"
        }
      }
    ]
  }

NPC dialogue via conversationSet. The target is the NPC's entity id (it must be tagged "talkable" or "talk to X" won't reach it). Each edit sets ONE word entry; entries are keyed by word, so re-setting a word replaces it. Word matching in play is EXACT (word or aliases, case-insensitive) — no stemming, no synonyms, same as scenery. Use conditions.first for the greeting, highlights to reveal topics, and effects to change the world when the player says the word:
  {
    "edits": [
      {
        "target": "npc:guide",
        "conversationSet": {
          "word": "hello",
          "aliases": ["hi", "hey"],
          "conditions": { "first": true },
          "narration": "You greet the old guide.",
          "response": "\\"Welcome. Ask me about the chest if you're curious.\\"",
          "highlights": ["chest"]
        }
      },
      {
        "target": "npc:guide",
        "conversationSet": {
          "word": "chest",
          "aliases": ["box"],
          "narration": "You ask about the chest.",
          "response": "\\"That old thing? Here — I'll unlock it for you.\\"",
          "effects": [
            { "type": "set-property", "entityId": "item:chest", "property": "locked", "value": false, "description": "Guide unlocked the chest" }
          ]
        }
      }
    ]
  }
Effects: set-property (property must be a registered name), move (property "location" + value <destination id>; entityId defaults to the NPC), close-conversation (ends the dialogue after this word). Read an NPC's existing dialogue first with query({kind:"conversation", id:"npc:guide"}), and playtest with the actual words: ["talk to guide", "chest", "bye"].

A mixed batch (multiple targets and operations in one call):
  {
    "edits": [
      { "target": "item:old-key", "entityDelete": true },
      { "target": "item:new-key", "entityCreate": { "tags": ["portable"], "name": "Brass Key", "description": "Shiny.", "location": "room:gate" } },
      { "target": "exit:gate:north", "entityUpdate": { "properties": { "locked": false } } }
    ]
  }
</apply-edits>`;
