/**
 * Scenario definitions for the agent-loop eval harness (agent-eval.ts).
 *
 * Each scenario is a realistic world-editing request plus an objective
 * verification script that runs against the COMMITTED world after the
 * session finishes — success is measured by playtest outcomes, not by the
 * agent's own summary.
 */

export interface VerifyStep {
  command: string;
  /** Step passes only if the outcome is one of these. */
  expectOutcome?: string[];
  /** Step fails if the outcome is one of these. */
  notOutcome?: string[];
  /** Step fails unless the output contains this (case-insensitive). */
  outputContains?: string;
}

export interface VerifyScript {
  label: string;
  setup?: Array<{ entityId: string; property: string; value: unknown }>;
  steps: VerifyStep[];
  /** If set, the player must end at this room id. */
  finalLocation?: string;
}

export interface EvalScenario {
  name: string;
  gameId: string;
  turnLimit: number;
  request: string;
  verify: VerifyScript[];
}

export const SCENARIOS: EvalScenario[] = [
  {
    // The historical failure case: multi-entity puzzle with a ditransitive
    // handler, hidden item, and exit gating. Three real sessions burned
    // 30/30 turns on variants of this.
    name: "lever-puzzle",
    gameId: "tinkermarket",
    turnLimit: 30,
    request:
      'Create a puzzle at "room:gate": the way north should be blocked by a stuck brass turnstile ' +
      "until the player fixes it. Specifically: (1) add a junk pile fixture in room:gate containing " +
      'a hidden rusty lever item (the player should be able to "examine junk pile" and "take lever"); ' +
      "(2) block the north exit while the turnstile is stuck, with a message about the turnstile; " +
      '(3) when the player does "put lever in turnstile", the turnstile unjams and the way north opens. ' +
      "Playtest the whole sequence before finishing.",
    verify: [
      {
        label: "blocked before solving",
        setup: [{ entityId: "player:1", property: "location", value: "room:gate" }],
        steps: [{ command: "go north", notOutcome: ["movement"] }],
        finalLocation: "room:gate",
      },
      {
        label: "full solve path",
        setup: [{ entityId: "player:1", property: "location", value: "room:gate" }],
        steps: [
          { command: "examine junk pile", notOutcome: ["error", "unresolved"] },
          { command: "take lever", expectOutcome: ["performed"] },
          { command: "put lever in turnstile", expectOutcome: ["performed"] },
          { command: "go north", expectOutcome: ["movement"] },
        ],
        finalLocation: "room:market-square-south",
      },
    ],
  },
  {
    // An easy single-handler task. Checks whether a model can do the basics
    // in a handful of turns: query the world, write one transitive handler,
    // playtest, finish.
    name: "notice-board",
    gameId: "tinkermarket",
    turnLimit: 15,
    request:
      'Players should be able to read the notice board ("item:notice-board") in ' +
      '"room:market-square-south". Add a verb handler so "read board" / "read notice board" ' +
      "shows a posted notice announcing that the Rendering Yards are closed for repairs. " +
      "Playtest it before finishing.",
    verify: [
      {
        label: "read the board",
        setup: [{ entityId: "player:1", property: "location", value: "room:market-square-south" }],
        steps: [
          {
            command: "read board",
            expectOutcome: ["performed"],
            outputContains: "rendering",
          },
        ],
      },
    ],
  },
  {
    // An NPC whose interaction actually changes the world: item consumed,
    // exit unlocked. Exercises NPC creation, "give X to Y" (ditransitive
    // with prep "to" — a different prep group than the lever puzzle),
    // world-state effects, and negative-case gating.
    name: "npc-gatekeeper",
    gameId: "tinkermarket",
    turnLimit: 30,
    request:
      'Create a yard warden NPC at "room:rendering-yards-entrance" who blocks the way north into ' +
      'the Smelting Bay. The NPC must answer to the noun "warden". The warden is hungry: when the ' +
      'player gives them the roasted nuts ("item:roasted-nuts", sold at the nut cart), the warden ' +
      "eats them (the nuts are consumed from the player's inventory), thanks the player, and opens " +
      "the way north. Until then, going north is refused with a message about the warden. " +
      'Make sure the exact command "give nuts to warden" works, and playtest both the blocked ' +
      "and unblocked paths.",
    verify: [
      {
        label: "blocked before feeding",
        setup: [
          { entityId: "player:1", property: "location", value: "room:rendering-yards-entrance" },
        ],
        steps: [{ command: "go north", notOutcome: ["movement"] }],
        finalLocation: "room:rendering-yards-entrance",
      },
      {
        label: "warden is present and examinable",
        setup: [
          { entityId: "player:1", property: "location", value: "room:rendering-yards-entrance" },
        ],
        steps: [{ command: "examine warden", expectOutcome: ["performed"] }],
      },
      {
        label: "feeding the warden opens the way",
        setup: [
          { entityId: "player:1", property: "location", value: "room:rendering-yards-entrance" },
          { entityId: "item:roasted-nuts", property: "location", value: "player:1" },
        ],
        steps: [
          { command: "give nuts to warden", expectOutcome: ["performed"] },
          { command: "go north", expectOutcome: ["movement"] },
        ],
        finalLocation: "room:smelting-bay",
      },
    ],
  },
  {
    // Room creation: a new room, exits both ways, contents. Exercises
    // entity creation with the "room" structural tag, exit wiring in both
    // directions, and reachability.
    name: "new-room",
    gameId: "tinkermarket",
    turnLimit: 30,
    request:
      "Build a hidden storeroom behind the Press House: create a new room with the exact id " +
      '"room:hidden-storeroom" — a cramped back room smelling of paper and machine oil. Connect it ' +
      'to "room:press-house" with an exit leading east from the Press House into the storeroom, and ' +
      "an exit leading back west from the storeroom to the Press House. Put one interesting " +
      "portable item of your choosing inside the storeroom. Playtest walking in and back out.",
    verify: [
      {
        label: "walk in from the Press House",
        setup: [{ entityId: "player:1", property: "location", value: "room:press-house" }],
        steps: [{ command: "go east", expectOutcome: ["movement"] }],
        finalLocation: "room:hidden-storeroom",
      },
      {
        label: "walk back out",
        setup: [{ entityId: "player:1", property: "location", value: "room:hidden-storeroom" }],
        steps: [{ command: "go west", expectOutcome: ["movement"] }],
        finalLocation: "room:press-house",
      },
      {
        label: "the storeroom is a functioning room",
        setup: [{ entityId: "player:1", property: "location", value: "room:hidden-storeroom" }],
        steps: [{ command: "look", expectOutcome: ["performed"] }],
      },
    ],
  },
];

export function getScenario(name: string): EvalScenario | null {
  return SCENARIOS.find((s) => s.name === name) || null;
}
