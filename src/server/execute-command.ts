import { processCommand } from "../core/index.js";
import type { GameInstance } from "../games/registry.js";
import { getStorage } from "./storage-instance.js";
import type { EventLogEntry, SessionKey } from "./storage.js";
import { handleUnresolvedExit, handleVerbFallbackCommand } from "./ai-commands.js";
import { handleConversationWord, checkForConversationStart } from "./conversation-commands.js";
import { handleSceneryCheck } from "./scenery-commands.js";
import { handleSpecialCommand } from "./special-commands.js";

export interface CommandInput {
  gameId: string;
  userId: string;
  text: string;
  debug?: boolean;
}

export interface CommandResult {
  output: string;
  debug?: unknown;
  conversationMode?: unknown;
  aiOutput?: string;
}

interface ExecuteOptions {
  game: GameInstance;
  reinitGame: (session: SessionKey) => Promise<GameInstance>;
  onAiStart?: () => void;
}

export async function executeCommand(
  input: CommandInput,
  { game, reinitGame, onAiStart }: ExecuteOptions,
): Promise<CommandResult> {
  const trimmed = input.text.trim();
  const session: SessionKey = { gameId: input.gameId, userId: input.userId };
  const opts = { gameId: input.gameId, session, prompts: game.prompts, debug: input.debug };

  // Conversation mode: route single-word input to conversation engine
  if (game.conversationState) {
    const convResult = await handleConversationWord(game, {
      word: trimmed,
      session,
    });
    return {
      output: convResult.output,
      conversationMode: convResult.conversationMode,
      debug: undefined,
    };
  }

  const special = handleSpecialCommand(trimmed, { game, session, opts, reinitGame });
  if (special) return await special;

  // Extract [bracketed instructions] for AI guidance
  const bracketMatch = /\[([^\]]+)]/.exec(trimmed);
  const aiInstructions = bracketMatch ? bracketMatch[1] : undefined;
  const commandText = bracketMatch
    ? trimmed.slice(0, bracketMatch.index).trim() +
      trimmed.slice(bracketMatch.index + bracketMatch[0].length).trim()
    : trimmed;

  const result = processCommand(game.store, {
    input: commandText,
    verbs: game.verbs,
    debug: input.debug,
  });

  if (result.unresolvedExit) {
    if (onAiStart) onAiStart();
    return handleUnresolvedExit(game.store, { context: result.unresolvedExit, ...opts });
  }

  // Check for scenery — words in the room description that can be examined
  if (result.unresolvedObject) {
    if (onAiStart) onAiStart();
    const sceneryResult = await handleSceneryCheck(game, {
      verb: result.unresolvedObject.verb,
      objectName: result.unresolvedObject.objectName,
      gameId: input.gameId,
      prompts: game.prompts,
      debug: input.debug,
    });
    if (sceneryResult) {
      return { output: sceneryResult.output, debug: sceneryResult.debug || result.debug };
    }
  }

  if (result.unhandled) {
    if (onAiStart) onAiStart();
    const fallback = await handleVerbFallbackCommand(game.store, {
      unhandled: result.unhandled,
      gameId: input.gameId,
      verbs: game.verbs,
      libClass: game.libClass,
      prompts: game.prompts,
      debug: input.debug,
      existingDebug: result.debug,
      aiInstructions,
    });
    if (fallback.events.length > 0) {
      const entry: EventLogEntry = {
        command: trimmed,
        events: fallback.events,
        timestamp: new Date().toISOString(),
      };
      await getStorage().appendEvent(session, entry);
    }
    return { output: fallback.output, aiOutput: fallback.aiOutput, debug: fallback.debug };
  }

  // Don't persist start-conversation events (ephemeral)
  const persistEvents = result.events.filter((e) => e.type !== "start-conversation");
  if (persistEvents.length > 0) {
    const entry: EventLogEntry = {
      command: trimmed,
      events: persistEvents,
      timestamp: new Date().toISOString(),
    };
    await getStorage().appendEvent(session, entry);
  }

  // Check if a start-conversation event was emitted
  const convStart = await checkForConversationStart(game, {
    events: result.events,
    session,
  });
  if (convStart) {
    return {
      output: convStart.output,
      conversationMode: convStart.conversationMode,
      debug: result.debug,
    };
  }

  return { output: result.output, debug: result.debug };
}
