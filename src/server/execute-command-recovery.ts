import { processCommand } from "../core/index.js";
import { EntityNotFoundError } from "../core/entity-errors.js";
import type { GameInstance } from "../games/registry.js";
import type { SessionKey } from "./storage.js";
import type { CommandResult } from "./execute-command.js";

interface RecoveryArgs {
  game: GameInstance;
  session: SessionKey;
  reinitGame: (s: SessionKey) => Promise<GameInstance>;
  processArgs: {
    input: string;
    verbs: GameInstance["verbs"];
    debug?: boolean;
    tracks?: GameInstance["tracks"];
  };
}

export type RecoveryResult =
  | { ok: true; game: GameInstance; result: Awaited<ReturnType<typeof processCommand>> }
  | { ok: false; response: CommandResult };

/**
 * Run processCommand, recovering once from EntityNotFoundError. The usual
 * trigger is admin tooling mutating D1 while this isolate holds a stale
 * GameInstance (e.g. deleting a room the player is standing in, or appending a
 * synthetic teleport event). reinitGame rebuilds the store from persisted
 * state, after which a retry usually succeeds.
 */
export async function processWithRecovery({
  game,
  session,
  reinitGame,
  processArgs,
}: RecoveryArgs): Promise<RecoveryResult> {
  try {
    return { ok: true, game, result: await processCommand(game.store, processArgs) };
  } catch (err: unknown) {
    if (!(err instanceof EntityNotFoundError)) throw err as Error;
    console.warn(`[execute-command] EntityNotFoundError (${err.entityId}); reinitializing session`);
    const rebuilt = await reinitGame(session);
    try {
      return { ok: true, game: rebuilt, result: await processCommand(rebuilt.store, processArgs) };
    } catch (retryErr: unknown) {
      if (!(retryErr instanceof EntityNotFoundError)) throw retryErr as Error;
      return {
        ok: false,
        response: {
          output: `Your session is in a broken state (missing ${retryErr.entityId}). Type /reset to start over.`,
        },
      };
    }
  }
}
