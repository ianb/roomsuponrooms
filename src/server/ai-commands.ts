import type { EntityStore, Entity } from "../core/entity.js";
import type { GamePrompts } from "../core/game-data.js";
import type { DebugInfo } from "../core/world.js";
import type { UnresolvedExitContext } from "../core/movement.js";
import type { VerbRegistry, ResolvedCommand } from "../core/verbs.js";
import type { WorldEvent } from "../core/verb-types.js";
import { appendEventLog } from "./event-log.js";
import type { HandlerLib } from "../core/handler-lib.js";
import { describeRoomFull } from "../core/describe.js";
import { isRoomLit, darknessDescription } from "../core/darkness.js";
import { handleAiCreate } from "./ai-create.js";
import { handleAiCreateExit } from "./ai-create-exit.js";
import { handleAiCreateRoom } from "./ai-create-room.js";
import { handleVerbFallback } from "./verb-fallback.js";
import { getAiEntityIds, removeAiEntity } from "./ai-entity-store.js";
import { listAiHandlerRecords, removeAiHandler } from "./ai-handler-store.js";

interface CommandResponse {
  output: string;
  aiOutput?: string;
  debug?: DebugInfo;
}

function describeCurrentRoom(store: EntityStore): string {
  const players = store.findByTag("player");
  const player = players[0];
  if (!player) return "No player found.";
  const roomId = player.properties["location"] as string;
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
  }: { instructions: string; gameId: string; prompts?: GamePrompts; debug?: boolean },
): Promise<CommandResponse> {
  const players = store.findByTag("player");
  const player = players[0];
  if (!player) return { output: "No player found." };
  const roomId = player.properties["location"] as string;
  const room = store.get(roomId);
  const result = await handleAiCreateExit(store, {
    instructions,
    room,
    gameId,
    prompts,
    debug,
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
  }: { description: string; gameId: string; prompts?: GamePrompts; debug?: boolean },
): Promise<CommandResponse> {
  const players = store.findByTag("player");
  const player = players[0];
  if (!player) return { output: "No player found." };
  const roomId = player.properties["location"] as string;
  const room = store.get(roomId);
  const result = await handleAiCreate(store, { description, room, gameId, prompts, debug });
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

export function handleAiDestroyCommand(
  store: EntityStore,
  { objectName, gameId }: { objectName: string; gameId: string },
): CommandResponse {
  const aiIds = getAiEntityIds(gameId);
  let match: string | null = null;
  for (const id of aiIds) {
    if (!store.has(id)) continue;
    const entity = store.get(id);
    const name = ((entity.properties["name"] as string) || "").toLowerCase();
    const aliases = (entity.properties["aliases"] as string[]) || [];
    if (
      name === objectName ||
      id === objectName ||
      aliases.some((a) => a.toLowerCase() === objectName)
    ) {
      match = id;
      break;
    }
  }
  if (!match) {
    // Check if there's a matching verb handler to suggest
    const verbMatches = listAiHandlerRecords(gameId).filter((r) =>
      r.name.toLowerCase().includes(objectName),
    );
    const hint = verbMatches.length > 0 ? `\nDid you mean: ai destroy verb ${objectName}` : "";
    return { output: `No AI-created object matching "${objectName}" found.${hint}` };
  }
  const entity = store.get(match);
  const entityName = (entity.properties["name"] as string) || match;
  store.delete(match);
  removeAiEntity(gameId, match);
  return { output: `[Destroyed ${entityName} (${match})]` };
}

export function handleAiDestroyVerbCommand({
  search,
  confirm,
  gameId,
  verbs,
}: {
  search: string;
  confirm: boolean;
  gameId: string;
  verbs: VerbRegistry;
}): CommandResponse {
  const records = listAiHandlerRecords(gameId);
  const lower = search.toLowerCase();
  const matches = records.filter((r) => r.name.toLowerCase().includes(lower));

  if (matches.length === 0) {
    return { output: `No AI verb handlers matching "${search}" found.` };
  }

  if (!confirm) {
    const lines = matches.map((r) => {
      const verb = r.pattern.verb;
      const form = r.pattern.form;
      const target = r.entityId || r.tag || "";
      const confirmCmd = `ai destroy verb confirm ${r.name}`;
      const header = `${r.name}  (${verb} ${form}${target ? " " + target : ""}) ((${confirmCmd}|delete))`;
      const code = r.perform.length > 200 ? r.perform.slice(0, 200) + "..." : r.perform;
      return `  ${header}\n    ${code}`;
    });
    return {
      output: `Found ${matches.length} AI verb handler(s):\n${lines.join("\n")}`,
    };
  }

  // Confirm mode — exact match required
  const exact = records.find((r) => r.name === search);
  if (!exact) {
    return { output: `No AI verb handler with exact name "${search}" found.` };
  }

  removeAiHandler(gameId, exact.name);
  verbs.removeByName(exact.name);
  return { output: `[Destroyed verb handler: ${exact.name}]` };
}

export async function handleUnresolvedExit(
  store: EntityStore,
  {
    context,
    gameId,
    prompts,
    debug,
  }: {
    context: UnresolvedExitContext;
    gameId: string;
    prompts?: GamePrompts;
    debug?: boolean;
  },
): Promise<CommandResponse> {
  const result = await handleAiCreateRoom(store, {
    exit: context.exit,
    sourceRoom: context.room,
    gameId,
    prompts,
    debug,
  });

  // Move the player to the new room
  store.setProperty(context.player.id, { name: "location", value: result.roomId });
  const moveEvent: WorldEvent = {
    type: "set-property",
    entityId: context.player.id,
    property: "location",
    value: result.roomId,
    description: `Moved ${context.direction}`,
  };
  const allEvents = [...result.events, moveEvent];

  // Persist events
  if (allEvents.length > 0) {
    appendEventLog(gameId, {
      command: `go ${context.direction}`,
      events: allEvents,
      timestamp: new Date().toISOString(),
    });
  }

  const roomDesc = describeCurrentRoom(store);
  return {
    output: roomDesc,
    aiOutput: result.notes ? `Notes: ${result.notes}` : undefined,
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
  }: {
    unhandled: UnhandledInput;
    gameId: string;
    verbs: VerbRegistry;
    libClass: typeof HandlerLib;
    prompts?: GamePrompts;
    debug?: boolean;
    existingDebug?: DebugInfo;
    aiInstructions?: string;
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
  });
  return {
    output: fallback.output,
    aiOutput: fallback.notes ? `Notes: ${fallback.notes}` : undefined,
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
