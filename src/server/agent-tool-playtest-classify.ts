import type { CommandResult } from "../core/world.js";
import type { PlaytestStep } from "./agent-tool-playtest.js";

/**
 * Map a processCommand result to a playtest step outcome. Pulled out of
 * agent-tool-playtest.ts to keep that file under the line cap.
 */
export function classifyOutcome(
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
  const o = debug && debug.outcome;
  if (o === "vetoed" || o === "movement" || o === "movement-blocked") return { outcome: o };
  return { outcome: "performed" };
}
