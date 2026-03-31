import { processCommand } from "../core/index.js";
import type { GameInstance } from "../games/registry.js";
import { getStorage } from "./storage-instance.js";
import type { AuthoringInfo, EventLogEntry, SessionKey } from "./storage.js";
import { handleUnresolvedExit, handleVerbFallbackCommand } from "./ai-commands.js";
import { handleConversationWord, checkForConversationStart } from "./conversation-commands.js";
import { handleSceneryCheck } from "./scenery-commands.js";
import { handleSpecialCommand } from "./special-commands.js";
import { RecentOutputBuffer } from "./recent-output.js";

export interface CommandInput {
  gameId: string;
  userId: string;
  text: string;
  debug?: boolean;
  roles?: string[];
}

export interface CommandResult {
  output: string;
  debug?: unknown;
  conversationMode?: unknown;
  aiOutput?: string;
  /** Human-readable descriptions of world state changes (e.g. "The wildflower was eaten.") */
  eventDescriptions?: string[];
}

interface ExecuteOptions {
  game: GameInstance;
  reinitGame: (session: SessionKey) => Promise<GameInstance>;
  onAiStart?: () => void;
}

async function trySceneryFallback(
  game: GameInstance,
  {
    unresolvedObject,
    hasAiRole,
    input,
    authoring,
    existingDebug,
    onAiStart,
  }: {
    unresolvedObject: { verb: string; objectName: string };
    hasAiRole: boolean;
    input: CommandInput;
    authoring: AuthoringInfo;
    existingDebug?: unknown;
    onAiStart?: () => void;
  },
): Promise<CommandResult | null> {
  if (!hasAiRole) return { output: "You don't see that here." };
  if (onAiStart) onAiStart();
  const sceneryAuthoring = { ...authoring, creationSource: "scenery" };
  const sceneryResult = await handleSceneryCheck(game, {
    verb: unresolvedObject.verb,
    objectName: unresolvedObject.objectName,
    gameId: input.gameId,
    prompts: game.prompts,
    debug: input.debug,
    authoring: sceneryAuthoring,
  });
  if (sceneryResult) {
    return { output: sceneryResult.output, debug: sceneryResult.debug || existingDebug };
  }
  return null;
}

function collectEventDescriptions(events: Array<{ description: string }>): string[] | undefined {
  const descs = events.map((e) => e.description).filter(Boolean);
  return descs.length > 0 ? descs : undefined;
}

function recordOutput(
  game: GameInstance,
  { command, output, entityId }: { command: string; output: string; entityId?: string },
): void {
  if (game.recentOutputs) {
    game.recentOutputs.add({ command, output, sourceEntityId: entityId });
  }
}

export async function executeCommand(
  input: CommandInput,
  { game, reinitGame, onAiStart }: ExecuteOptions,
): Promise<CommandResult> {
  const trimmed = input.text.trim();
  const session: SessionKey = { gameId: input.gameId, userId: input.userId };
  const hasAiRole = !input.roles || input.roles.includes("ai");
  // Ensure recent output buffer exists on game instance
  if (!game.recentOutputs) {
    game.recentOutputs = new RecentOutputBuffer(3);
  }
  const authoring: AuthoringInfo = {
    createdBy: input.userId,
    creationSource: "unknown",
    creationCommand: trimmed,
  };
  const opts = {
    gameId: input.gameId,
    session,
    prompts: game.prompts,
    debug: input.debug,
    hasAiRole,
    authoring,
  };

  // Conversation mode: route single-word input to conversation engine
  if (game.conversationState) {
    const convAuthoring = { ...authoring, creationSource: "conversation" };
    const convResult = await handleConversationWord(game, {
      word: trimmed,
      session,
      authoring: convAuthoring,
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
    if (!hasAiRole) return { output: result.output || "You can't go that way." };
    if (onAiStart) onAiStart();
    const exitAuthoring = { ...authoring, creationSource: "unresolved-exit" };
    return handleUnresolvedExit(game.store, {
      context: result.unresolvedExit,
      ...opts,
      authoring: exitAuthoring,
    });
  }

  // Check for scenery — words in descriptions or recent output
  if (result.unresolvedObject) {
    const sceneryRes = await trySceneryFallback(game, {
      unresolvedObject: result.unresolvedObject,
      hasAiRole,
      input,
      authoring,
      existingDebug: result.debug,
      onAiStart,
    });
    if (sceneryRes) return sceneryRes;
  }

  if (result.unhandled) {
    if (!hasAiRole) return { output: result.output || "I don't understand that." };
    if (onAiStart) onAiStart();
    const verbAuthoring = { ...authoring, creationSource: "verb-fallback" };
    const fallback = await handleVerbFallbackCommand(game.store, {
      unhandled: result.unhandled,
      gameId: input.gameId,
      verbs: game.verbs,
      libClass: game.libClass,
      prompts: game.prompts,
      debug: input.debug,
      existingDebug: result.debug,
      aiInstructions,
      authoring: verbAuthoring,
    });
    if (fallback.events.length > 0) {
      const entry: EventLogEntry = {
        command: trimmed,
        events: fallback.events,
        timestamp: new Date().toISOString(),
      };
      await getStorage().appendEvent(session, entry);
    }
    const targetId =
      result.unhandled.command.form !== "intransitive"
        ? result.unhandled.command.object.id
        : undefined;
    recordOutput(game, { command: trimmed, output: fallback.output, entityId: targetId });
    return {
      output: fallback.output,
      aiOutput: fallback.aiOutput,
      debug: fallback.debug,
      eventDescriptions: collectEventDescriptions(fallback.events),
    };
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

  const primaryEntityId = result.events.length > 0 ? result.events[0]!.entityId : undefined;
  recordOutput(game, { command: trimmed, output: result.output, entityId: primaryEntityId });
  return {
    output: result.output,
    debug: result.debug,
    eventDescriptions: collectEventDescriptions(result.events),
  };
}
