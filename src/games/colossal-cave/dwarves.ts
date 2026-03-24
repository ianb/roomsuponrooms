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

/**
 * Dwarf spawning on tick.
 * Each tick in a dwarfish room, there's a chance a dwarf appears.
 */
export const dwarfSpawn: VerbHandler = {
  name: "[tick]-dwarf-spawn",
  source: "dwarves.ts",
  pattern: { verb: SYSTEM_VERBS.TICK, form: "intransitive" },
  priority: -30,
  check(context: VerbContext) {
    // Only in dwarfish rooms
    if (!context.room.tags.has("dwarfish")) return { applies: false };
    // Don't spawn if dwarf is already visible
    const dwarf = context.store.tryGet("npc:dwarf");
    if (!dwarf) return { applies: false };
    if (dwarf.properties["location"] === context.room.id) return { applies: false };
    // Don't spawn if no dwarves remain
    const remaining = (dwarf.properties["remaining"] as number) || 0;
    if (remaining <= 0) return { applies: false };
    return { applies: true };
  },
  perform(context: VerbContext): PerformResult {
    const dwarf = context.store.get("npc:dwarf");
    const remaining = (dwarf.properties["remaining"] as number) || 0;
    // Random chance based on remaining dwarves
    if (!context.store.random.odds(remaining, 100)) {
      return { output: "", events: [] };
    }
    return {
      output: "A threatening little dwarf comes out of the shadows!",
      events: [moveEvent("npc:dwarf", { to: context.room.id, description: "Dwarf appeared" })],
    };
  },
};

/**
 * Encounter handler: when the player enters a room with a dwarf,
 * the dwarf may throw a knife.
 */
export const dwarfEncounter: VerbHandler = {
  name: "[encounter]-dwarf",
  source: "dwarves.ts",
  pattern: { verb: SYSTEM_VERBS.ENCOUNTER, form: "transitive" },
  priority: 10,
  tag: "dwarf",
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "transitive") return { output: "", events: [] };
    const dwarf = context.command.object;

    // Mirror canyon: dwarf admires himself
    if (context.room.id === "room:in-mirror-canyon") {
      return { output: "The dwarf admires himself in the mirror.", events: [] };
    }

    // 75% chance of aggression
    if (!context.store.random.chance(0.75)) {
      return { output: "", events: [] };
    }

    // First encounter: throws axe and runs
    if (dwarf.properties["hasAxe"] === true) {
      return {
        output: "The dwarf throws a nasty little axe at you, misses, curses, and runs away.",
        events: [
          setPropEvent("npc:dwarf", {
            property: "hasAxe",
            value: false,
            description: "Dwarf threw axe",
          }),
          moveEvent("item:axe", { to: context.room.id, description: "Axe lands in room" }),
          moveEvent("npc:dwarf", { to: "void", description: "Dwarf ran away" }),
        ],
      };
    }

    // Subsequent: throws knife (9.5% hit chance)
    if (context.store.random.chance(0.095)) {
      return {
        output: "The dwarf throws a nasty little knife at you, and hits!",
        events: [],
        // TODO: death handling
      };
    }
    return {
      output: "The dwarf throws a nasty little knife at you, but misses!",
      events: [],
    };
  },
};

/**
 * Dwarf follows player between rooms on tick.
 * If dwarf is on-stage but not in the player's room, it may follow.
 */
export const dwarfFollow: VerbHandler = {
  name: "[tick]-dwarf-follow",
  source: "dwarves.ts",
  pattern: { verb: SYSTEM_VERBS.TICK, form: "intransitive" },
  priority: -31,
  check(context: VerbContext) {
    const dwarf = context.store.tryGet("npc:dwarf");
    if (!dwarf) return { applies: false };
    const dwarfLoc = dwarf.properties["location"] as string;
    if (dwarfLoc === "void") return { applies: false };
    if (dwarfLoc === context.room.id) return { applies: false };
    if (!context.room.tags.has("dwarfish")) return { applies: false };
    return { applies: true };
  },
  perform(context: VerbContext): PerformResult {
    // 96% chance of following
    if (!context.store.random.chance(0.96)) {
      return {
        output: "",
        events: [moveEvent("npc:dwarf", { to: "void", description: "Dwarf wandered off" })],
      };
    }
    return {
      output: "The dwarf stalks after you...",
      events: [moveEvent("npc:dwarf", { to: context.room.id, description: "Dwarf followed" })],
    };
  },
};

/** Throwing axe at dwarf — 2/3 chance to kill */
export const throwAxeAtDwarf: VerbHandler = {
  name: "throw-axe-dwarf",
  source: "dwarves.ts",
  pattern: { verb: "throw", verbAliases: ["toss"], form: "ditransitive" },
  priority: 10,
  check(context: VerbContext) {
    if (context.command.form !== "ditransitive") return { applies: false };
    if (context.command.object.id !== "item:axe") return { applies: false };
    if (!context.command.indirect.tags.has("dwarf")) return { applies: false };
    return { applies: true };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "ditransitive") return { output: "Throw what?", events: [] };
    const dwarf = context.store.get("npc:dwarf");
    const events: WorldEvent[] = [
      moveEvent("item:axe", { to: context.room.id, description: "Axe lands in room" }),
    ];

    if (context.store.random.chance(0.667)) {
      const remaining = (dwarf.properties["remaining"] as number) || 0;
      events.push(
        moveEvent("npc:dwarf", { to: "void", description: "Dwarf killed" }),
        setPropEvent("npc:dwarf", {
          property: "remaining",
          value: remaining - 1,
          description: "One fewer dwarf",
        }),
      );
      return {
        output: "You killed a little dwarf! The body vanishes in a cloud of greasy black smoke.",
        events,
      };
    }
    events.push(moveEvent("npc:dwarf", { to: "void", description: "Dwarf dodged" }));
    return {
      output: "Missed! The little dwarf dodges out of the way of the axe.",
      events,
    };
  },
};
