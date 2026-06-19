import type { EntityStore, Entity } from "./entity.js";
import type { HandlerData } from "./game-data.js";

// --- Parsed command structures ---

export type ParsedCommand =
  | { form: "intransitive"; verb: string }
  | { form: "transitive"; verb: string; object: string }
  | { form: "prepositional"; verb: string; prep: string; object: string }
  | { form: "ditransitive"; verb: string; object: string; prep: string; indirect: string };

// --- Resolved command (objects matched to entities) ---

export type ResolvedCommand =
  | { form: "intransitive"; verb: string }
  | { form: "transitive"; verb: string; object: Entity }
  | { form: "prepositional"; verb: string; prep: string; object: Entity }
  | { form: "ditransitive"; verb: string; object: Entity; prep: string; indirect: Entity };

// --- Handler phases and results ---

export type CheckResult = { applies: true } | { applies: false };

export type VetoResult = { blocked: false } | { blocked: true; output: string };

export interface PerformResult {
  output: string;
  events: WorldEvent[];
  /** If true, override the handler to NOT consume a turn */
  freeTurn?: boolean;
}

export interface WorldEvent {
  type: string;
  entityId: string;
  property?: string;
  value?: unknown;
  oldValue?: unknown;
  description: string;
}

// --- Declarative requirements ---

export interface EntityRequirements {
  tags?: string[];
  properties?: Record<string, unknown>;
}

// --- Verb handler ---

export interface VerbPattern {
  verb: string;
  /** Alternative verb words that match the same handler */
  verbAliases?: string[];
  form: ParsedCommand["form"];
  prep?: string;
}

/** System verb names — bracketed to distinguish from player verbs */
export const SYSTEM_VERBS = {
  ENTER: "[enter]",
  LEAVE: "[leave]",
  TICK: "[tick]",
  /** Fired for each entity in the room when the player enters */
  ENCOUNTER: "[encounter]",
} as const;

export interface VerbHandler {
  /** Human-readable name for debugging, e.g. "take" or "put-in-container" */
  name: string;
  /** Source file:line for debugging, e.g. "container-verbs.ts:23" */
  source?: string;
  pattern: VerbPattern;
  priority: number;
  /** If true, this action does NOT advance the game clock */
  freeTurn?: boolean;
  entityId?: string;
  tag?: string;
  objectRequirements?: EntityRequirements;
  indirectRequirements?: EntityRequirements;
  // Return values may be sync (built-in TS handlers) or async (data-driven
  // handlers that run in the sandbox). Dispatch awaits either.
  check?: (context: VerbContext) => CheckResult | Promise<CheckResult>;
  veto?: (context: VerbContext) => VetoResult | Promise<VetoResult>;
  perform: (context: VerbContext) => PerformResult | Promise<PerformResult>;
  /**
   * Original source record this handler was compiled from, if any.
   * Carried on data-driven (HandlerData-derived) handlers so partial
   * updates can merge into the full shape. Built-in code handlers that
   * register directly via VerbRegistry.register() leave this undefined.
   */
  data?: HandlerData;
}

export interface VerbContext {
  store: EntityStore;
  command: ResolvedCommand;
  player: Entity;
  room: Entity;
}

export type DispatchResult =
  | {
      outcome: "performed";
      output: string;
      events: WorldEvent[];
      handler: string;
      source?: string;
      freeTurn: boolean;
    }
  | { outcome: "vetoed"; output: string; vetoedBy: string }
  | {
      outcome: "unhandled";
      /** Set when an AI handler threw and was removed from the registry —
       *  lets tooling (playtest) report the error instead of a bare miss. */
      removedBroken?: { handler: string; error: string };
    };
