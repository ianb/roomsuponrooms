import type { EntityStore, Entity } from "../core/entity.js";
import type { GamePrompts } from "../core/game-data.js";
import type { DebugInfo } from "../core/world.js";
import type { UnresolvedExitContext } from "../core/movement.js";
import type { VerbRegistry, ResolvedCommand } from "../core/verbs.js";
import type { WorldEvent } from "../core/verb-types.js";
import { getStorage } from "./storage-instance.js";
import type { AuthoringInfo, EventLogEntry, SessionKey } from "./storage.js";
import type { HandlerLib } from "../core/handler-lib.js";
import { describeRoomFull } from "../core/describe.js";
import { isRoomLit, darknessDescription } from "../core/darkness.js";
import { handleAiCreate } from "./ai-create.js";
import { handleAiCreateExit } from "./ai-create-exit.js";
import { handleAiCreateRoom } from "./ai-create-room.js";
import { handleVerbFallback } from "./verb-fallback.js";

export { handleAiDestroyCommand, handleAiDestroyVerbCommand } from "./ai-destroy.js";
export { handleAiAgentCommand } from "./ai-agent-command.js";

interface CommandResponse {
  output: string;
  aiOutput?: string;
  debug?: DebugInfo;
}

function describeCurrentRoom(store: EntityStore): string {
  const players = store.findByTag("player");
  const player = players[0];
  if (!player) return "No player found.";
  const roomId = player.location;
  const room = store.get(roomId);
  if (!isRoomLit(store, { room, playerId: player.id })) {
    return darknessDescription();
  }
  return describeRoomFull(store, { room, playerId: player.id });
}

export async function handleAiCreateExitCommand(
  store: EntityStore,
  {
    instructions,
    gameId,
    prompts,
    debug,
    authoring,
  }: {
    instructions: string;
    gameId: string;
    prompts?: GamePrompts;
    debug?: boolean;
    authoring: AuthoringInfo;
  },
): Promise<CommandResponse> {
  const players = store.findByTag("player");
  const player = players[0];
  if (!player) return { output: "No player found." };
  const roomId = player.location;
  const room = store.get(roomId);
  const result = await handleAiCreateExit(store, {
    instructions,
    room,
    gameId,
    prompts,
    debug,
    authoring,
  });
  const roomDesc = describeCurrentRoom(store);
  return {
    output: roomDesc,
    aiOutput: result.output,
    debug:
      debug && result.debug
        ? {
            parse: `ai create exit "${instructions}"`,
            outcome: `created ${result.entityId}`,
            aiFallback: {
              systemPrompt: result.debug.systemPrompt,
              prompt: result.debug.prompt,
              response: result.debug.response,
              durationMs: result.debug.durationMs,
            },
          }
        : undefined,
  };
}

export async function handleAiCreateCommand(
  store: EntityStore,
  {
    description,
    gameId,
    prompts,
    debug,
    authoring,
  }: {
    description: string;
    gameId: string;
    prompts?: GamePrompts;
    debug?: boolean;
    authoring: AuthoringInfo;
  },
): Promise<CommandResponse> {
  const players = store.findByTag("player");
  const player = players[0];
  if (!player) return { output: "No player found." };
  const roomId = player.location;
  const room = store.get(roomId);
  const result = await handleAiCreate(store, {
    description,
    room,
    gameId,
    playerId: player.id,
    prompts,
    debug,
    authoring,
  });
  const roomDesc = describeCurrentRoom(store);
  return {
    output: roomDesc,
    aiOutput: result.output,
    debug:
      debug && result.debug
        ? {
            parse: `ai create "${description}"`,
            outcome: `created ${result.entityId}`,
            aiFallback: {
              systemPrompt: result.debug.systemPrompt,
              prompt: result.debug.prompt,
              response: result.debug.response,
              durationMs: result.debug.durationMs,
            },
          }
        : undefined,
  };
}

export async function handleUnresolvedExit(
  store: EntityStore,
  {
    context,
    session,
    prompts,
    debug,
    authoring,
  }: {
    context: UnresolvedExitContext;
    session: SessionKey;
    prompts?: GamePrompts;
    debug?: boolean;
    authoring: AuthoringInfo;
  },
): Promise<CommandResponse> {
  const result = await handleAiCreateRoom(store, {
    exit: context.exit,
    sourceRoom: context.room,
    gameId: session.gameId,
    playerId: context.player.id,
    prompts,
    debug,
    authoring,
  });

  // Move the player to the new room (session event — cleared on reset)
  store.setLocation(context.player.id, result.roomId);
  const moveEvent: WorldEvent = {
    type: "set-property",
    entityId: context.player.id,
    property: "location",
    value: result.roomId,
    description: `Moved ${context.direction}`,
  };
  // Only persist the player move — AI world-building is saved via saveAiEntity
  const entry: EventLogEntry = {
    command: `go ${context.direction}`,
    events: [moveEvent],
    timestamp: new Date().toISOString(),
  };
  await getStorage().appendEvent(session, entry);

  const roomDesc = describeCurrentRoom(store);
  return {
    output: roomDesc,
    aiOutput: debug && result.notes ? `Notes: ${result.notes}` : undefined,
    debug:
      debug && result.debug
        ? {
            parse: `go ${context.direction}`,
            outcome: `materialized ${result.roomId}`,
            aiFallback: {
              systemPrompt: result.debug.systemPrompt,
              prompt: result.debug.prompt,
              response: result.debug.response,
              durationMs: result.debug.durationMs,
            },
          }
        : undefined,
  };
}

interface UnhandledInput {
  command: ResolvedCommand;
  player: Entity;
  room: Entity;
}

interface FallbackResponse {
  output: string;
  aiOutput?: string;
  events: WorldEvent[];
  debug?: DebugInfo;
}

export async function handleVerbFallbackCommand(
  store: EntityStore,
  {
    unhandled,
    gameId,
    verbs,
    libClass,
    prompts,
    debug,
    existingDebug,
    aiInstructions,
    authoring,
  }: {
    unhandled: UnhandledInput;
    gameId: string;
    verbs: VerbRegistry;
    libClass: typeof HandlerLib;
    prompts?: GamePrompts;
    debug?: boolean;
    existingDebug?: DebugInfo;
    aiInstructions?: string;
    authoring: AuthoringInfo;
  },
): Promise<FallbackResponse> {
  const fallback = await handleVerbFallback(store, {
    command: unhandled.command,
    player: unhandled.player,
    room: unhandled.room,
    verbs,
    gameId,
    libClass,
    prompts,
    debug,
    aiInstructions,
    authoring,
  });
  return {
    output: fallback.output,
    aiOutput: debug && fallback.notes ? `Notes: ${fallback.notes}` : undefined,
    events: fallback.events,
    debug: existingDebug
      ? {
          ...existingDebug,
          outcome: fallback.handler ? `ai-${fallback.handler.name}` : "ai-fallback",
          aiFallback: fallback.debug,
        }
      : undefined,
  };
}
