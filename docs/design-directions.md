# Design Directions

Concrete options and plans for making the game more fun, drawing from sandbox research, the current architecture, and ideas from the conversation.

## Terminology Note

The entity system is entities-with-properties and tags, dispatched through a verb-handler registry. Not ECS (no independent systems iterating entities by component). The architecture is verb-driven: command -> parse -> resolve -> handler. This is closer to LambdaMOO's verb-on-object dispatch than a simulation loop.

---

## 1. Nearby Entity Context for AI Generation

**Problem:** When the AI creates a room, object, or verb handler, it only sees the current room and its contents. It can't create things that complement what's in adjacent rooms or the player's inventory.

**Proposal:** When building prompts for AI creation and verb fallback, gather entities from nearby rooms (1-2 exits away) and the player's inventory. Include them as optional context — things the AI can reference or create complements to, but isn't required to.

Something like:

```
<nearby-entities>
These exist in nearby rooms. You may reference or create things that
relate to them, but are not required to.

- Broken power conduit (room:engineering-bay, tags: device, fixed)
  "A thick cable dangling from the ceiling, sparking intermittently."
- Maintenance drone (room:corridor-7b, tags: npc, automated)
  "A small wheeled robot, motionless. Its status light blinks amber."
</nearby-entities>

<player-inventory>
- Rusty wrench (tags: portable, tool)
- Access card (tags: portable, keycard)
</player-inventory>
```

The AI might then create a room with a panel that needs a wrench, or a locked door that responds to keycards, or a charging station for the drone. Not guaranteed, but seeded.

**Scope:** This touches `ai-create.ts`, `ai-create-room.ts`, `verb-fallback-prompt.ts`. Need a utility that walks the room graph 1-2 hops and collects entity summaries.

---

## 2. "Use X with Y" Interactions

**Problem:** Combinatorial interactions ("use wrench on panel", "pour water on plant", "plug cable into socket") are the heart of adventure games, but right now they're handled generically by verb fallback. The AI resolves each one in isolation without understanding that these combinations are where the fun is.

**Proposal:** Two parts:

**A. Prompt the AI to favor combinatorial outcomes.** When a player uses a prepositional or ditransitive verb (put X in Y, use X on Y, give X to Y), the verb fallback prompt should emphasize that these interactions are opportunities for interesting state changes, not just flavor text. Something like:

```
<interaction-guidance>
The player is combining two objects. This is often the most interesting
moment in the game. Consider whether this combination could produce a
meaningful change — unlocking something, powering something, transforming
something, revealing something. Favor outcomes that change the world over
outcomes that just describe what happens.
</interaction-guidance>
```

**B. Suggest nearby objects in verb fallback prompts.** When the AI generates a handler for "examine broken panel", include a note about what the player is carrying and what's nearby. The handler might then include a check: "if the player has a wrench, mention that the bolts look removable."

---

## 3. Richer Properties as Interaction Vocabulary

**Problem:** The property system defines what objects CAN be, but most AI-created objects end up with just name/description/location. The AI doesn't create objects with mechanically interesting properties because the available properties don't suggest interesting interactions.

**Proposal:** Expand the per-world property definitions to include properties that imply interactions. These become a vocabulary the AI can use when creating objects:

For The Aaru:
```json
{
  "name": "powerSource",
  "description": "What powers this device (battery, solar, reactor, manual). Devices without power don't function. Players can potentially provide alternative power sources.",
  "schema": { "type": "string" }
},
{
  "name": "fluidContents",
  "description": "What liquid this container holds (water, fuel, coolant, chemical). Can be poured, mixed, or consumed with various effects.",
  "schema": { "type": "string" }
},
{
  "name": "signalFrequency",
  "description": "Radio/data frequency this device operates on. Devices on the same frequency can interact or interfere with each other.",
  "schema": { "type": "string" }
}
```

The property descriptions themselves teach the AI how things can interact. A "powerSource" property that says "Players can potentially provide alternative power sources" is a hint to the verb fallback AI that "use battery on device" should probably work.

This is world-specific. Colossal Cave might have properties like `material` (stone, wood, metal — fire interacts differently), `weight` (affects what you can carry or throw), `lightSource` (illumination mechanics). The Aaru has tech-oriented properties.

---

## 4. Room Prompts with Secrets and Potential

**Problem:** Room `aiPrompt` values currently describe tone and setting. They don't seed specific interactions or hidden possibilities.

**Proposal:** Room and region `aiPrompt` should include latent possibilities — things that aren't visible in the room description but could emerge when a player interacts. The AI sees these when generating verb handlers or scenery, but the player doesn't.

Example region prompt for a section of The Aaru:
```
This section was a botanical research wing. The plant life here has been
growing unchecked for centuries and has developed unusual properties.

LATENT: Some plants respond to sound — singing or playing music near them
causes visible reactions. The large vine in the atrium is actually a
network connecting several rooms; affecting it in one room has effects
in others. The water in the irrigation channels contains trace nutrients
that have mild psychoactive effects if consumed.
```

The verb fallback AI sees this when a player examines a plant or tries to sing. The room description doesn't mention any of it. The player discovers these by experimenting — which is exactly the competence/mastery loop from self-determination theory.

This is also how "vibing with the hidden prompts" works as a skill. Players who pay attention to environmental cues and try creative actions are rewarded because they're more likely to trigger these latent possibilities. It's a learnable skill that doesn't look like a game mechanic.

---

## 5. Conversation Effects (Bug Fix)

**Problem:** The AI conversation response schema doesn't include `effects` or `perform`, so NPC conversations can never change the world, even though the `WordEntry` type supports it.

**Fix:** Add effects to the conversation AI schema:

```typescript
effects: z.array(z.object({
  type: z.enum(["set-property", "move", "close-conversation"]),
  entityId: z.string().optional(),
  property: z.string().optional(),
  value: z.unknown().optional(),
  description: z.string(),
})).describe(
  "0-2 world changes caused by this conversation topic. Use sparingly — most responses are just dialogue. But sometimes an NPC should give the player something, reveal a passage, change their own state, etc."
)
```

And update the prompt to tell the AI when effects are appropriate:
```
Conversations can optionally produce effects — changing a property,
moving an object, closing the conversation. Use these when the NPC
would naturally act: handing over an item, opening a door, becoming
hostile. Most conversation entries should NOT have effects.
```

This is small, specific, and directly addresses a gap.

---

## 6. Better Parse Failure Messages

**Problem:** When a command doesn't parse, the player sees `I don't understand "xyz". Type "help" for commands.` This doesn't help them understand what IS possible.

**Proposal:** Improve parse failure messages to show what the parser actually accepts:

```
I don't understand "flurble the gnork."

Commands look like:
  go north          (movement)
  take lamp          (verb + object)
  put key in chest   (verb + object + preposition + object)
  look / inventory   (single-word commands)
  talk to wizard     (start conversation)

You can also try examining things mentioned in the room description.
```

For resolution failures (verb parses but object not found), list visible objects:

```
You don't see "sword" here.

You can see: wooden table, brass lamp, leather bag
Exits: north, east
```

This is a UI fix, not an AI fix. It helps players understand the parser's shape so they can be creative within it rather than frustrated by invisible walls.

---

## 7. Affordance-Oriented Descriptions

**Problem:** AI-generated descriptions tend to be atmospheric but don't suggest actions. "A console with a dark screen" is less interesting than "A console with a dark screen and a row of physical switches, one of which is flipped to OFF."

**Proposal:** Update the AI prompts for room and entity creation to explicitly request affordance-rich descriptions:

```
<description-guidance>
Descriptions should suggest what a player might DO, not just what they
see. Mention physical details that imply interaction: switches that can
be flipped, containers that can be opened, surfaces that show wear from
use, connections to other things. A good description makes the player
want to try something.

Bad: "A large machine sits against the wall."
Good: "A large machine sits against the wall, its intake valve hanging
open. A faded label reads COOLANT ONLY."
</description-guidance>
```

This is purely a prompt change — no code modification needed. The AI already generates descriptions; we just need to steer them toward interactivity.

---

## 8. Entity Secrets

**Problem:** AI-generated content is what-you-see-is-what-you-get. Objects and rooms have descriptions, but no hidden depth. There's nothing to discover beyond what's visible. Players who experiment creatively get the same quality of response as players who don't.

**Proposal:** Add a `secret` property to entities — a natural language field that the AI sees during verb resolution and conversations, but that the player never sees directly. Secrets describe hidden potential, vulnerabilities, connections, or behaviors.

**How it works:**

1. When the AI creates an entity (room, object, NPC), the creation prompt asks it to optionally generate a secret:

```
<secret-guidance>
Optionally include a secret — something not obvious from the description
that could emerge through creative player interaction. Secrets make the
world feel deeper than it appears. Not every entity needs a secret, but
many benefit from one.

Examples:
- An object that has an unexpected use: "The crystal resonates at a
  specific frequency — tapping it near other crystals causes harmonics"
- An NPC hiding something: "Knows the access code for deck 7 but won't
  share it unless the player demonstrates knowledge of the old crew"
- A room with a hidden feature: "The mural on the east wall is actually
  a pressure-sensitive panel"
- An object that connects to something nearby: "Contains trace amounts
  of the same compound found in the irrigation system two rooms north"
</secret-guidance>
```

2. During verb fallback, the target entity's secret is included in the prompt, wrapped in `<secret>` tags with instructions:

```
<secret>
This is hidden information about the object. The player doesn't know
this. You should be aware of it when resolving the action, but don't
reveal it directly. If the player's action naturally engages with the
secret, let it partially emerge — reward their intuition without giving
everything away.

${entity.properties.secret}
</secret>
```

3. During NPC conversations, the NPC's secret is included similarly. The AI can hint at it, let it slip under the right conditions, or guard it.

4. Room and region `aiPrompt` fields can include `<secret>` sections that game authors write manually. These apply to all AI generation within that room/region. The AI prompt system already passes these through; we just need to document the `<secret>` convention and add handling instructions.

**What changes:**

- `base-properties.ts`: Add `secret` property (string, optional). Mark it as excluded from player-visible output.
- `ai-create.ts`, `ai-create-room.ts`: Update creation schemas to include optional `secret` field.
- `verb-fallback.ts`: When building the prompt, include target entity's secret in `<secret>` tags.
- `ai-conversation.ts`: Include NPC's secret in the conversation system prompt.
- `ai-scenery.ts`: Include room's secret when generating scenery descriptions.
- Per-world creation prompts (`world-create.md`): Add world-specific guidance about what kinds of secrets fit the setting.

**The meta-game:** Over time, players learn that the world has hidden depth and that experimenting is rewarded. "Vibing with the hidden prompts" becomes a learnable skill — paying attention to environmental cues, trying unusual combinations, asking NPCs the right questions. This is the competence/mastery loop from self-determination theory, but it doesn't look like a game mechanic. It feels like the world is just richer than you thought.

**Secrets as connective tissue:** When entity creation is context-aware (#1), secrets can reference nearby entities. "This power cell is compatible with the drone in the adjacent corridor." The player doesn't see this, but when they try "use power cell on drone," the verb fallback AI knows it should work.

---

## 9. Overlapping Simple Systems (Exploratory)

**Problem:** We want emergence from interacting systems, but we don't have multiple systems — we have one system (verb dispatch) that handles everything.

**Possible approaches:**

**A. Property-based reactions.** Define automatic reactions when certain properties change. If a room's `temperature` goes above a threshold, flammable objects ignite. If a device's `powerSource` is set, it activates. These are rules that apply globally, not per-handler.

This would be a new concept: a `reaction` registry alongside the `verb` registry. Reactions fire when property values cross thresholds, not when the player types a command. The verb handler changes a property; the reaction system notices and cascades.

```typescript
interface Reaction {
  watch: { tag?: string; property: string };
  condition: (value: unknown) => boolean;
  effect: (entity: Entity, store: EntityStore) => WorldEvent[];
}
```

**B. Tag-based affordance matching.** When a prepositional command resolves (use X on Y), before hitting verb fallback, check if X's tags suggest it can interact with Y's tags. Tool + broken-device -> repair attempt. Key + locked -> unlock attempt. Liquid + container -> pour. These aren't handlers; they're hints that guide the AI's decision toward mechanical outcomes.

**C. Turn-based environmental ticks.** After each player command, check for entities with an `autonomous` tag and give them a chance to act. A ticking bomb counts down. A guard patrols. A plant grows. This would be lightweight — just property changes and a text notification, not a full simulation tick.

These are bigger architectural changes. Worth prototyping one at a time. Property-based reactions (A) seems like the smallest useful step.

---

## 10. Drama Manager (Exploratory)

**Problem:** The world is reactive — nothing happens unless the player acts. Extended quiet exploration can feel flat.

**Possible approaches:**

**A. Periodic ambient events.** Every N commands, roll for an ambient event in the current zone. "You hear a distant rumble." "The lights flicker." "A maintenance drone trundles past and disappears around a corner." These are flavor, but they make the world feel alive.

**B. Tension escalation.** Track how many turns since the last "interesting" event (AI creation, conversation, significant state change). If the count gets high, inject something: an NPC appears, a device activates, a passage opens. The drama manager doesn't generate content itself — it triggers the AI to generate something contextual.

**C. Reactive world events.** When the player does something significant (enters a new zone, takes a notable item, destroys something), queue a delayed consequence. Three turns later, "You hear footsteps behind you" or "The ground trembles." This creates the feeling of a world that notices what you do.

All of these require some concept of a "turn counter" or "event since last interesting thing" tracker. The event log already tracks commands; we'd just need to analyze it for interest level.

---

## Priority Order

Based on effort vs. impact:

1. ~~**Conversation effects** (#5)~~ — **Done.** AI conversation schema now includes effects (set-property, move, close-conversation). Effects applied and logged in handleUnknownWord.
2. ~~**Entity secrets** (#8)~~ — **Done.** `secret` property added, generated during creation, consumed in verb fallback, conversations, and scenery. Backfilled on existing game content.
3. ~~**Better parse failures** (#6)~~ — **Done.** Parse breakdown and allowed forms now shown on resolution failures.
4. ~~**Affordance-oriented descriptions** (#7)~~ — **Done.** Creation prompts and schemas now steer descriptions toward interactive details.
5. **Nearby entity context** (#1) — Medium effort. Makes AI generation context-aware, creates a connected world. Combines powerfully with secrets.
6. ~~**Use X with Y guidance** (#2)~~ — **Done.** Verb fallback prompt now documents `indirect` variable, adds ditransitive code example, and steers AI toward mechanical outcomes for combinations.
7. ~~**Room prompts with secrets** (#4)~~ — **Done.** Secrets backfilled on existing game content, creation prompt guidance added for both worlds.
8. **Richer properties** (#3) — Needs per-world design work. Creates interaction vocabulary.
9. **Overlapping systems** (#9) — Architectural. Start with property-based reactions as a prototype.
10. **Drama manager** (#10) — Architectural. Start with ambient events as a prototype.
