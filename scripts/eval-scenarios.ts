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
];

export function getScenario(name: string): EvalScenario | null {
  return SCENARIOS.find((s) => s.name === name) || null;
}
