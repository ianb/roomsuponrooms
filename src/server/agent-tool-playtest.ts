import { z } from "zod";
import { processCommand } from "../core/world.js";
import type { Entity, EntityStore } from "../core/entity.js";
import type { CommandResult } from "../core/world.js";
import type { VerbContext } from "../core/verb-types.js";
import type { VerbRegistry } from "../core/verbs.js";
import { describeResolved } from "../core/debug-helpers.js";
import { diagnoseUnhandled } from "../core/verb-diagnostics.js";
import type { ToolContext } from "./agent-tool-context.js";
import { applyPendingEditsToWorld } from "./agent-world-view.js";
import { loadAgentGameInstance } from "./agent-game-loader.js";
import { trySceneryResolve, describeSceneryGap } from "./agent-tool-playtest-scenery.js";

const MAX_OUTPUT_BYTES = 10_000;

// --- Schema ---

export const playtestInputSchema = z.object({
  setup: z
    .array(
      z.object({
        entityId: z.string().describe("The entity id to mutate."),
        property: z
          .string()
          .describe(
            "Property name. Special-cased: 'location' moves the entity (set value to a player id to put it in inventory). 'name', 'description', 'visits' update the corresponding field. Anything else must be a registered property.",
          ),
        value: z.unknown().describe("New value. null erases the property."),
      }),
    )
    .optional()
    .describe(
      "Initial state mutations applied before any commands run. Use this to put the player in a specific room, give them an item, unlock a door, set a flag, etc. Mutations apply directly without going through verb dispatch — they let you shortcut prerequisites to test something specific.",
    ),
  commands: z
    .array(z.string())
    .min(1)
    .describe(
      "Player commands to run in order, e.g. ['take lever', 'go north', 'examine turnstile']. Each command runs through the parser and verb dispatch exactly as if the player typed it, except that AI fallback is disabled — unhandled commands surface as outcome:'unhandled' instead of triggering verb-fallback.",
    ),
});

export type PlaytestInput = z.infer<typeof playtestInputSchema>;

// --- Result shapes ---

export interface PlaytestStep {
  command: string;
  outcome:
    | "performed"
    | "vetoed"
    | "unhandled"
    | "unresolved"
    | "movement"
    | "movement-blocked"
    | "error";
  output: string;
  /**
   * How the parser/resolver interpreted the command. For resolved commands,
   * each noun phrase is annotated with the entity id it resolved to, e.g.
   * `insert rusty lever [item:rusty-lever] into turnstile [item:stuck-turnstile]`.
   * For unresolved/error/unparseable inputs the parsed form is used (no ids).
   */
  parse?: string;
  /** Set when outcome === 'performed' or 'movement'. */
  handler?: string;
  /**
   * On outcome === 'unhandled', a list of handlers whose verb (or alias)
   * matched the parsed verb but were rejected, with a short reason. Lets the
   * agent see whether dispatch failed due to wrong form, missing tag, failed
   * objectRequirements, etc.
   */
  candidates?: Array<{ handler: string; reason: string }>;
  /** WorldEvents emitted during this command. */
  events: Array<{
    type: string;
    entityId: string;
    property?: string;
    value?: unknown;
    description?: string;
  }>;
  /** Error message if a verb handler threw. */
  error?: string;
}

export interface PlaytestResult {
  ok: true;
  steps: PlaytestStep[];
  finalState: {
    playerLocation: string;
    playerInventory: Array<{ id: string; name: string; tags: string[] }>;
    currentRoom: { id: string; name: string };
  };
  /**
   * Set when the command loop was aborted before running the rest of the
   * commands because a step came back unhandled, unresolved, or errored.
   * Includes the index of the failing step and the reason category so the
   * agent can quickly see which step stopped the playtest.
   */
  abortedAt?: { stepIndex: number; reason: "unhandled" | "unresolved" | "error" };
  /** Number of trailing steps dropped to fit the size cap. */
  omittedSteps?: number;
  /** Hint when steps were omitted. */
  hint?: string;
}

export interface PlaytestError {
  ok: false;
  error: string;
}

class SetupTargetMissingError extends Error {
  override name = "SetupTargetMissingError";
  constructor(public readonly id: string) {
    super("Setup target entity not found");
  }
}

// --- Runner ---

export async function runPlaytest(
  context: ToolContext,
  input: PlaytestInput,
): Promise<PlaytestResult | PlaytestError> {
  // Build a fresh, sandboxed game instance from materialized state plus this
  // session's pending edits. This is independent from the agent's own
  // in-memory store, so simulation mutations don't pollute the agent's view
  // and the simulation discards naturally at the end.
  let game;
  try {
    game = await loadAgentGameInstance(context.gameId);
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  try {
    applyPendingEditsToWorld(context.pendingEdits, {
      store: game.store,
      verbs: game.verbs,
      gameId: context.gameId,
    });
  } catch (e: unknown) {
    return {
      ok: false,
      error: `Failed to apply pending edits: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Apply setup. Each entry is one setProperty call which routes special
  // fields like 'location' through setLocation internally.
  if (input.setup) {
    for (const item of input.setup) {
      try {
        applySetupItem(game.store, item);
      } catch (e: unknown) {
        return {
          ok: false,
          error: `Setup failed at "${item.entityId}.${item.property}": ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }
  }

  // Run each command. processCommand handles parsing, resolution, and verb
  // dispatch but NOT AI fallback, conversation mode, or persistence —
  // exactly what we want for a sandboxed simulation.
  //
  // Abort the loop on the first unhandled/unresolved/error step. Continuing
  // past one of those just runs subsequent commands against a divergent state
  // and confuses the agent — better to surface one clean failure with full
  // diagnostics than a misleading parade of "performed" steps that depended
  // on a step that didn't actually happen.
  const steps: PlaytestStep[] = [];
  let abortedAt: PlaytestResult["abortedAt"] | undefined;
  for (const command of input.commands) {
    const step = runOneCommand({ store: game.store, verbs: game.verbs, command });
    steps.push(step);
    if (step.outcome === "unhandled" || step.outcome === "unresolved" || step.outcome === "error") {
      abortedAt = { stepIndex: steps.length - 1, reason: step.outcome };
      break;
    }
  }

  // Build the final state summary so the agent doesn't have to follow up
  // with another query.
  const finalState = buildFinalState(game.store);

  // Apply size cap. Drop trailing steps if needed so the agent at least
  // sees the early ones.
  let result: PlaytestResult = { ok: true, steps, finalState };
  if (abortedAt) result.abortedAt = abortedAt;
  let serialized = JSON.stringify(result);
  let omitted = 0;
  while (serialized.length > MAX_OUTPUT_BYTES && steps.length > 0) {
    steps.pop();
    omitted += 1;
    result = { ok: true, steps, finalState };
    serialized = JSON.stringify(result);
  }
  if (omitted > 0) {
    result.omittedSteps = omitted;
    result.hint = `${omitted} trailing step${omitted === 1 ? "" : "s"} omitted to fit the ${MAX_OUTPUT_BYTES}-byte cap. Run a shorter sequence or split it across calls.`;
  }
  return result;
}

function applySetupItem(
  store: EntityStore,
  item: { entityId: string; property: string; value: unknown },
): void {
  if (!store.has(item.entityId)) throw new SetupTargetMissingError(item.entityId);
  store.setProperty(item.entityId, { name: item.property, value: item.value });
}

function classifyOutcome(
  result: CommandResult,
  debug: { outcome?: string } | undefined,
): { outcome: PlaytestStep["outcome"]; handlerError?: string } {
  if (result.unresolvedExit || result.unresolvedObject) {
    return { outcome: "unresolved" };
  }
  if (result.unhandled && result.unhandled.removedBroken) {
    // A handler matched but its code threw; the registry auto-removed it.
    // Report the actual error — a bare "unhandled" here sends the agent
    // chasing dispatch problems when the real bug is in its handler code.
    const broken = result.unhandled.removedBroken;
    return {
      outcome: "error",
      handlerError:
        `Handler "${broken.handler}" threw: ${broken.error}. ` +
        "The broken handler was automatically removed from the registry — " +
        "fix the code and re-apply it (handlerCreate) before playtesting again.",
    };
  }
  if (result.unhandled) return { outcome: "unhandled" };
  if (debug && debug.outcome === "vetoed") return { outcome: "vetoed" };
  if (debug && debug.outcome === "movement") return { outcome: "movement" };
  if (debug && debug.outcome === "movement-blocked") return { outcome: "movement-blocked" };
  return { outcome: "performed" };
}

function runOneCommand({
  store,
  verbs,
  command,
}: {
  store: EntityStore;
  verbs: VerbRegistry;
  command: string;
}): PlaytestStep {
  let result: CommandResult;
  try {
    result = processCommand(store, { input: command, verbs, debug: true });
  } catch (e: unknown) {
    return {
      command,
      outcome: "error",
      output: "",
      events: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
  const events = result.events.map((e) => ({
    type: e.type,
    entityId: e.entityId,
    property: e.property,
    value: e.value,
    description: e.description,
  }));
  const debug = result.debug as { outcome?: string; handler?: string; parse?: string } | undefined;

  // Scenery fallback: processCommand only consults the entity registry, so an
  // examine of a stored scenery word comes back as unresolved here even though
  // it would resolve in real play (via executeCommand's trySceneryFallback).
  // Surface stored scenery hits so the agent can verify its scenery edits
  // without depending on the AI fallback (which is disabled in playtest).
  if (result.unresolvedObject) {
    const resolved = trySceneryResolve(store, { command, unresolved: result.unresolvedObject });
    if (resolved) return resolved;
  }

  const { outcome, handlerError } = classifyOutcome(result, debug);
  const step: PlaytestStep = {
    command,
    outcome,
    output: result.output,
    events,
  };
  if (handlerError) step.error = handlerError;
  if (debug && debug.handler) step.handler = debug.handler;
  // Build a parse string. For unhandled commands the resolver succeeded —
  // re-derive the parse with entity ids from result.unhandled.command so the
  // agent can see exactly which entities the noun phrases bound to. For other
  // outcomes fall back to whatever debug.parse already gave us.
  if (result.unhandled) {
    step.parse = describeResolved(result.unhandled.command);
  } else if (debug && debug.parse) {
    step.parse = debug.parse;
  }
  if (result.unhandled) {
    const ctx: VerbContext = {
      store,
      command: result.unhandled.command,
      player: result.unhandled.player,
      room: result.unhandled.room,
    };
    const candidates = diagnoseUnhandled(ctx, { verbs });
    if (candidates.length > 0) step.candidates = candidates;
  }
  // If this remains unresolved, attach a scenery diagnostic so the agent can
  // see which words the room *would* resolve and which it wouldn't.
  if (outcome === "unresolved" && result.unresolvedObject) {
    const diagnostic = describeSceneryGap(store, result.unresolvedObject.objectName);
    if (diagnostic) step.output = `${step.output}\n${diagnostic}`;
  }
  return step;
}

function buildFinalState(store: EntityStore): PlaytestResult["finalState"] {
  const players = store.findByTag("player");
  const player = players[0];
  if (!player) {
    return {
      playerLocation: "",
      playerInventory: [],
      currentRoom: { id: "", name: "(no player)" },
    };
  }
  const playerLocation = player.location;
  const room = store.has(playerLocation) ? store.get(playerLocation) : null;
  const inventory: Entity[] = store.getContents(player.id);
  return {
    playerLocation,
    playerInventory: inventory.map((e) => ({ id: e.id, name: e.name, tags: e.tags })),
    currentRoom: room
      ? { id: room.id, name: room.name }
      : { id: playerLocation, name: "(unknown)" },
  };
}
