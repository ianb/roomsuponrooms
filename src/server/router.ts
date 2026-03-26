import { z } from "zod";
import { router, publicProcedure } from "./trpc.js";
import { processCommand, describeRoomFull } from "../core/index.js";
import type { EntityStore } from "../core/index.js";
import { loadAiHandlers } from "./ai-handler-store.js";
import { loadAiEntities } from "./ai-entity-store.js";
import { appendEventLog, replayEventLog, clearEventLog, popEventLog } from "./event-log.js";
import { composeVerbPrompt, composeCreatePrompt } from "./ai-prompts.js";
import {
  handleAiCreateExitCommand,
  handleAiCreateCommand,
  handleAiDestroyCommand,
  handleUnresolvedExit,
  handleVerbFallbackCommand,
} from "./ai-commands.js";
import type { GameInstance } from "../games/registry.js";
import { getGame, listGames } from "../games/registry.js";
import { handleTalkTo, handleConversationWord } from "./conversation-commands.js";

// Import game registrations
import "../games/test-world.js";
import "../games/colossal-cave/index.js";
import "../games/the-aaru/index.js";

const activeGames: Map<string, GameInstance> = new Map();

class GameNotFoundError extends Error {
  constructor(public readonly slug: string) {
    super(`Game not found: ${slug}`);
    this.name = "GameNotFoundError";
  }
}

/** Create a fresh game instance, load AI entities, replay event log, load AI handlers */
function initGame(slug: string): GameInstance {
  const def = getGame(slug);
  if (!def) throw new GameNotFoundError(slug);
  const instance = def.create();
  loadAiEntities(slug, instance.store);
  instance.store.snapshot();
  replayEventLog(slug, instance.store);
  loadAiHandlers(slug, instance.verbs);
  return instance;
}

function getOrCreateGame(slug: string): GameInstance {
  const existing = activeGames.get(slug);
  if (existing) return existing;
  const instance = initGame(slug);
  activeGames.set(slug, instance);
  return instance;
}

function describeCurrentRoom(s: EntityStore): string {
  const players = s.findByTag("player");
  const player = players[0];
  if (!player) return "No player found.";
  const roomId = player.properties["location"] as string;
  const room = s.get(roomId);
  return describeRoomFull(s, { room, playerId: player.id });
}

/** Check command result events for a start-conversation event and activate conversation mode */
function checkForConversationStart(
  game: GameInstance,
  { events, gameId }: { events: Array<{ type: string; entityId: string }>; gameId: string },
): { output: string; conversationMode: { npcName: string; knownWords: string[] } | null } | null {
  const startEvent = events.find((e) => e.type === "start-conversation");
  if (!startEvent) return null;
  const result = handleTalkTo(game, { npcId: startEvent.entityId, gameId });
  return {
    output: result.output,
    conversationMode: result.conversationMode || null,
  };
}

const gameInput = z.object({ gameId: z.string() });

export const appRouter = router({
  games: publicProcedure.query(() => {
    return listGames().map((g) => ({
      slug: g.slug,
      title: g.title,
      description: g.description,
    }));
  }),

  look: publicProcedure.input(gameInput).query(({ input }) => {
    const game = getOrCreateGame(input.gameId);
    return { output: describeCurrentRoom(game.store) };
  }),

  command: publicProcedure
    .input(z.object({ gameId: z.string(), text: z.string(), debug: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const game = getOrCreateGame(input.gameId);
      const trimmed = input.text.trim();
      const opts = { gameId: input.gameId, prompts: game.prompts, debug: input.debug };

      // If in conversation mode, route single-word input to conversation engine
      if (game.conversationState) {
        const convResult = handleConversationWord(game, {
          word: trimmed,
          gameId: input.gameId,
        });
        return {
          output: convResult.output,
          conversationMode: convResult.conversationMode,
          debug: undefined,
        };
      }

      if (trimmed === "/undo") {
        const popped = popEventLog(input.gameId);
        if (!popped) return { output: "Nothing to undo.", debug: undefined };
        const rebuilt = initGame(input.gameId);
        activeGames.set(input.gameId, rebuilt);
        return { output: "[Undone]\n\n" + describeCurrentRoom(rebuilt.store), debug: undefined };
      }

      if (trimmed === "/reset") {
        clearEventLog(input.gameId);
        const rebuilt = initGame(input.gameId);
        activeGames.set(input.gameId, rebuilt);
        return { output: "[Reset]\n\n" + describeCurrentRoom(rebuilt.store), debug: undefined };
      }

      if (trimmed.startsWith("ai create exit ")) {
        const instructions = trimmed.slice("ai create exit ".length).trim();
        if (!instructions)
          return { output: "Usage: ai create exit <description>", debug: undefined };
        return handleAiCreateExitCommand(game.store, { instructions, ...opts });
      }

      if (trimmed.startsWith("ai create ")) {
        const description = trimmed.slice("ai create ".length).trim();
        if (!description) return { output: "Usage: ai create <description>", debug: undefined };
        return handleAiCreateCommand(game.store, { description, ...opts });
      }

      if (trimmed.startsWith("ai destroy ")) {
        const objectName = trimmed.slice("ai destroy ".length).trim().toLowerCase();
        if (!objectName) return { output: "Usage: ai destroy <object>", debug: undefined };
        return handleAiDestroyCommand(game.store, { objectName, gameId: input.gameId });
      }

      const result = processCommand(game.store, {
        input: trimmed,
        verbs: game.verbs,
        debug: input.debug,
      });

      if (result.unresolvedExit) {
        return handleUnresolvedExit(game.store, { context: result.unresolvedExit, ...opts });
      }

      if (result.unhandled) {
        const fallback = await handleVerbFallbackCommand(game.store, {
          unhandled: result.unhandled,
          gameId: input.gameId,
          verbs: game.verbs,
          libClass: game.libClass,
          prompts: game.prompts,
          debug: input.debug,
          existingDebug: result.debug,
        });
        if (fallback.events.length > 0) {
          appendEventLog(input.gameId, {
            command: trimmed,
            events: fallback.events,
            timestamp: new Date().toISOString(),
          });
        }
        return { output: fallback.output, aiOutput: fallback.aiOutput, debug: fallback.debug };
      }

      // Don't persist start-conversation events (ephemeral)
      const persistEvents = result.events.filter((e) => e.type !== "start-conversation");
      if (persistEvents.length > 0) {
        appendEventLog(input.gameId, {
          command: trimmed,
          events: persistEvents,
          timestamp: new Date().toISOString(),
        });
      }

      // Check if a start-conversation event was emitted
      const convStart = checkForConversationStart(game, {
        events: result.events,
        gameId: input.gameId,
      });
      if (convStart) {
        return {
          output: convStart.output,
          conversationMode: convStart.conversationMode,
          debug: result.debug,
        };
      }

      return { output: result.output, debug: result.debug };
    }),

  reset: publicProcedure.input(gameInput).mutation(({ input }) => {
    clearEventLog(input.gameId);
    const instance = initGame(input.gameId);
    activeGames.set(input.gameId, instance);
    return { output: describeCurrentRoom(instance.store) };
  }),

  entities: publicProcedure.input(gameInput).query(({ input }) => {
    const game = getOrCreateGame(input.gameId);
    const ids = game.store.getAllIds();
    const players = game.store.findByTag("player");
    const playerRoomId = players[0] ? (players[0].properties["location"] as string) || null : null;
    const items = ids.map((id) => {
      const snap = game.store.getSnapshot(id);
      const initial = game.store.getInitialState(id);
      const hasChanges =
        initial !== null && JSON.stringify(snap.properties) !== JSON.stringify(initial.properties);
      return {
        id: snap.id,
        name: (snap.properties["name"] as string) || snap.id,
        tags: snap.tags,
        location: (snap.properties["location"] as string) || null,
        hasChanges,
      };
    });
    return { items, playerRoomId };
  }),

  entity: publicProcedure
    .input(z.object({ gameId: z.string(), id: z.string() }))
    .query(({ input }) => {
      const game = getOrCreateGame(input.gameId);
      if (!game.store.has(input.id)) return null;
      const current = game.store.getSnapshot(input.id);
      const initial = game.store.getInitialState(input.id);
      return { current, initial };
    }),

  prompts: publicProcedure.input(gameInput).query(({ input }) => {
    const game = getOrCreateGame(input.gameId);
    const players = game.store.findByTag("player");
    const player = players[0];
    if (!player)
      return {
        verb: "",
        create: "",
        world: null,
        worldVerb: null,
        worldCreate: null,
        region: null,
        room: null,
      };
    const roomId = player.properties["location"] as string;
    const room = game.store.get(roomId);
    const promptCtx = { prompts: game.prompts, room, store: game.store };
    const roomPrompt = (room.properties["aiPrompt"] as string) || null;
    const regionId = room.properties["location"] as string | undefined;
    let regionPrompt: string | null = null;
    if (regionId && regionId !== "world" && game.store.has(regionId)) {
      const region = game.store.get(regionId);
      if (region.tags.has("region")) {
        regionPrompt = (region.properties["aiPrompt"] as string) || null;
      }
    }
    return {
      verb: composeVerbPrompt(promptCtx),
      create: composeCreatePrompt(promptCtx),
      world: (game.prompts && game.prompts.world) || null,
      worldVerb: (game.prompts && game.prompts.worldVerb) || null,
      worldCreate: (game.prompts && game.prompts.worldCreate) || null,
      region: regionPrompt,
      room: roomPrompt,
    };
  }),
});

export type AppRouter = typeof appRouter;
