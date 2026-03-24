import type { VerbHandler, VerbContext, PerformResult, WorldEvent } from "../../core/verbs.js";
import { SYSTEM_VERBS } from "../../core/verb-types.js";

function moveEvent(
  entityId: string,
  { to, description }: { to: string; description: string },
): WorldEvent {
  return { type: "set-property", entityId, property: "location", value: to, description };
}

function setPropEvent(
  entityId: string,
  { property, value, description }: { property: string; value: unknown; description: string },
): WorldEvent {
  return { type: "set-property", entityId, property, value, description };
}

const PIRATE_STASH = "room:dead-end-13";

/**
 * Pirate appears on tick in dwarfish rooms.
 * 1% chance per turn. Steals visible treasures or just gets spotted.
 */
export const pirateTick: VerbHandler = {
  name: "[tick]-pirate",
  source: "pirate.ts",
  pattern: { verb: SYSTEM_VERBS.TICK, form: "intransitive" },
  priority: -35,
  check(context: VerbContext) {
    const pirate = context.store.tryGet("npc:pirate");
    if (!pirate) return { applies: false };
    if (pirate.properties["retired"] === true) return { applies: false };
    if (!context.room.tags.has("dwarfish")) return { applies: false };
    if (context.room.id === "room:in-secret-canyon") return { applies: false };
    // 1% chance
    if (!context.store.random.odds(1, 100)) return { applies: false };
    return { applies: true };
  },
  perform(context: VerbContext): PerformResult {
    const pirate = context.store.get("npc:pirate");
    const events: WorldEvent[] = [];

    // If dwarf is visible, pirate flees
    const dwarf = context.store.tryGet("npc:dwarf");
    if (dwarf && dwarf.properties["location"] === context.room.id) {
      return {
        output: "A bearded pirate appears, catches sight of the dwarf and runs away.",
        events: [],
      };
    }

    // Find visible treasures (in room or carried by player)
    const roomContents = context.store.getContentsDeep(context.room.id);
    const visibleTreasures = roomContents.filter((e) => e.tags.has("treasure"));

    if (visibleTreasures.length === 0) {
      // No treasures visible — pirate is spotted and retires
      if (pirate.properties["spotted"] === true) {
        return { output: "", events: [] };
      }
      events.push(
        setPropEvent("npc:pirate", {
          property: "spotted",
          value: true,
          description: "Pirate spotted",
        }),
        setPropEvent("npc:pirate", {
          property: "retired",
          value: true,
          description: "Pirate retired",
        }),
      );
      return {
        output:
          'There are faint rustling noises from the darkness behind you. As you turn toward them, you spot a bearded pirate. He is carrying a large chest.\n\n"Shiver me timbers!" he cries, "I\'ve been spotted! I\'d best hie meself off to the maze to hide me chest!"\n\nWith that, he vanishes into the gloom.',
        events,
      };
    }

    // Treasures visible — pirate steals them all
    if (pirate.properties["rich"] === true) {
      return { output: "", events: [] };
    }
    events.push(
      setPropEvent("npc:pirate", {
        property: "rich",
        value: true,
        description: "Pirate stole treasures",
      }),
    );
    if (pirate.properties["spotted"] === true) {
      events.push(
        setPropEvent("npc:pirate", {
          property: "retired",
          value: true,
          description: "Pirate retired after stealing",
        }),
      );
    }

    for (const treasure of visibleTreasures) {
      events.push(moveEvent(treasure.id, { to: PIRATE_STASH, description: "Stolen by pirate" }));
    }

    return {
      output:
        'Out from the shadows behind you pounces a bearded pirate! "Har, har," he chortles. "I\'ll just take all this booty and hide it away with me chest deep in the maze!" He snatches your treasure and vanishes into the gloom.',
      events,
    };
  },
};
