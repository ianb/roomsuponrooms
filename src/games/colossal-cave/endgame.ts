import type { VerbHandler, VerbContext, PerformResult, WorldEvent } from "../../core/verbs.js";
import { SYSTEM_VERBS } from "../../core/verb-types.js";

function setPropEvent(
  entityId: string,
  { property, value, description }: { property: string; value: unknown; description: string },
): WorldEvent {
  return { type: "set-property", entityId, property, value, description };
}

function moveEvent(
  entityId: string,
  { to, description }: { to: string; description: string },
): WorldEvent {
  return { type: "set-property", entityId, property: "location", value: to, description };
}

/**
 * Check each tick if all treasures are found. If so, start the cave closing countdown.
 */
export const caveClosingCheck: VerbHandler = {
  name: "[tick]-cave-closing-check",
  source: "endgame.ts",
  pattern: { verb: SYSTEM_VERBS.TICK, form: "intransitive" },
  priority: -50,
  check(context: VerbContext) {
    const player = context.player;
    if (player.properties["caveClosing"] === true) return { applies: false };
    if (player.properties["caveClosed"] === true) return { applies: false };
    // Check if all treasures have been found
    const treasures = context.store.findByTag("treasure");
    const allFound = treasures.every((t) => t.properties["scored_found"] === true);
    if (!allFound) return { applies: false };
    return { applies: true };
  },
  perform(context: VerbContext): PerformResult {
    const events: WorldEvent[] = [
      setPropEvent(context.player.id, {
        property: "caveClosing",
        value: true,
        description: "Cave is closing",
      }),
      setPropEvent(context.player.id, {
        property: "closingCountdown",
        value: 25,
        description: "25 turns until cave closes",
      }),
      setPropEvent(context.player.id, {
        property: "score",
        value: ((context.player.properties["score"] as number) || 0) + 25,
        description: "Bonus for finding all treasures",
      }),
    ];

    // Remove NPCs and lock things down
    const entitiesToRemove = ["npc:dwarf", "item:troll", "item:dragon", "item:bear"];
    for (const id of entitiesToRemove) {
      if (context.store.has(id)) {
        events.push(moveEvent(id, { to: "void", description: "Removed for cave closing" }));
      }
    }
    // Lock the grate
    if (context.store.has("door:grate:down")) {
      events.push(
        setPropEvent("door:grate:down", {
          property: "locked",
          value: true,
          description: "Grate locked",
        }),
        setPropEvent("door:grate:up", {
          property: "locked",
          value: true,
          description: "Grate locked",
        }),
      );
    }
    // Set dwarf count to 0
    if (context.store.has("npc:dwarf")) {
      events.push(
        setPropEvent("npc:dwarf", {
          property: "remaining",
          value: 0,
          description: "No more dwarves",
        }),
      );
    }
    // Retire pirate
    if (context.store.has("npc:pirate")) {
      events.push(
        setPropEvent("npc:pirate", {
          property: "retired",
          value: true,
          description: "Pirate retired",
        }),
      );
    }

    return {
      output:
        'A sepulchral voice reverberating through the cave says, "Cave closing soon. All adventurers exit immediately through main office."',
      events,
    };
  },
};

/**
 * Count down the cave closing timer each tick.
 */
export const caveClosingCountdown: VerbHandler = {
  name: "[tick]-cave-closing-countdown",
  source: "endgame.ts",
  pattern: { verb: SYSTEM_VERBS.TICK, form: "intransitive" },
  priority: -51,
  check(context: VerbContext) {
    if (context.player.properties["caveClosing"] !== true) return { applies: false };
    if (context.player.properties["caveClosed"] === true) return { applies: false };
    return { applies: true };
  },
  perform(context: VerbContext): PerformResult {
    const countdown = (context.player.properties["closingCountdown"] as number) || 0;
    const newCount = countdown - 1;

    if (newCount > 0) {
      return {
        output: "",
        events: [
          setPropEvent(context.player.id, {
            property: "closingCountdown",
            value: newCount,
            description: `${newCount} turns until cave closes`,
          }),
        ],
      };
    }

    // Cave closes — teleport player to repository
    const events: WorldEvent[] = [
      setPropEvent(context.player.id, {
        property: "caveClosed",
        value: true,
        description: "Cave is closed",
      }),
      setPropEvent(context.player.id, {
        property: "caveClosing",
        value: false,
        description: "Closing phase ended",
      }),
      setPropEvent(context.player.id, {
        property: "score",
        value: ((context.player.properties["score"] as number) || 0) + 10,
        description: "Bonus for reaching endgame",
      }),
      moveEvent(context.player.id, {
        to: "room:at-ne-end",
        description: "Teleported to repository",
      }),
    ];

    // Move some items to repository
    const itemsToNE = ["item:bottle", "item:lantern"];
    const itemsToSW = ["item:bird", "item:pillow"];
    for (const id of itemsToNE) {
      if (context.store.has(id)) {
        events.push(moveEvent(id, { to: "room:at-ne-end", description: "Moved to repository" }));
      }
    }
    for (const id of itemsToSW) {
      if (context.store.has(id)) {
        events.push(moveEvent(id, { to: "room:at-sw-end", description: "Moved to repository" }));
      }
    }

    return {
      output:
        'The sepulchral voice intones, "The cave is now closed." As the echoes fade, there is a blinding flash of light (and a small puff of orange smoke). . .\n\nAs your eyes refocus, you look around...',
      events,
    };
  },
};

/**
 * BLAST command — win or die in the repository.
 *
 * TODO: death/resurrection system not yet implemented.
 * Currently dying just prints a message without ending the game.
 */
export const blast: VerbHandler = {
  name: "blast",
  source: "endgame.ts",
  pattern: { verb: "blast", verbAliases: ["detonate", "explode"], form: "intransitive" },
  priority: 100,
  perform(context: VerbContext): PerformResult {
    const loc = context.room.id;
    if (loc !== "room:at-sw-end" && loc !== "room:at-ne-end") {
      return { output: "I see no dynamite here.", events: [] };
    }

    const rod = context.store.tryGet("item:rod-mark");
    const rodLoc = rod ? (rod.properties["location"] as string) : null;

    // TODO: item:rod-mark doesn't exist yet — this is the "black mark rod"
    // from the endgame repository. For now check a simpler condition.
    if (loc === "room:at-sw-end" && rodLoc === "room:at-ne-end") {
      const score = ((context.player.properties["score"] as number) || 0) + 35;
      return {
        output:
          "There is a loud explosion, and a twenty-foot hole appears in the far wall, burying the dwarves in the rubble. You march through the hole and find yourself in the main office, where a cheering band of friendly elves carry the conquering adventurer off into the sunset.\n\n*** You have won! ***\n\nFinal score: " +
          score,
        events: [
          setPropEvent(context.player.id, {
            property: "score",
            value: score,
            description: "Won the game!",
          }),
          setPropEvent(context.player.id, {
            property: "gameOver",
            value: true,
            description: "Game won",
          }),
        ],
      };
    }

    if (loc === "room:at-ne-end" && rodLoc === "room:at-sw-end") {
      return {
        output:
          "There is a loud explosion, and a twenty-foot hole appears in the far wall, burying the snakes in the rubble. A river of molten lava pours in through the hole, destroying everything in its path, including you!\n\nYou have died.",
        events: [],
      };
    }

    return {
      output:
        "There is a loud explosion, and you are suddenly splashed across the walls of the room.\n\nYou have died.",
      events: [],
    };
  },
};
