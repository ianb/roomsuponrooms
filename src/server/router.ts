import { z } from "zod";
import { router, publicProcedure } from "./trpc.js";
import { processCommand, describeRoomFull } from "../core/index.js";
import type { EntityStore } from "../core/index.js";
import { handleVerbFallback } from "./verb-fallback.js";
import { loadAiHandlers } from "./ai-handler-store.js";
import { handleAiCreate, loadAiEntities, getAiEntityIds, removeAiEntity } from "./ai-create.js";
import { appendEventLog, replayEventLog, clearEventLog, popEventLog } from "./event-log.js";
import type { GameInstance } from "../games/registry.js";
import { getGame, listGames } from "../games/registry.js";

// Import game registrations
import "../games/test-world.js";
import "../games/colossal-cave/index.js";

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

      // Handle /undo — pop last event log entry and rebuild world
      if (trimmed === "/undo") {
        const popped = popEventLog(input.gameId);
        if (!popped) {
          return { output: "Nothing to undo.", debug: undefined };
        }
        const rebuilt = initGame(input.gameId);
        activeGames.set(input.gameId, rebuilt);
        return { output: "[Undone]\n\n" + describeCurrentRoom(rebuilt.store), debug: undefined };
      }

      // Handle /reset — clear event log, rebuild world (keeping AI entities)
      if (trimmed === "/reset") {
        clearEventLog(input.gameId);
        const rebuilt = initGame(input.gameId);
        activeGames.set(input.gameId, rebuilt);
        return { output: "[Reset]\n\n" + describeCurrentRoom(rebuilt.store), debug: undefined };
      }

      // Handle "ai create ..."
      if (trimmed.startsWith("ai create ")) {
        const description = trimmed.slice("ai create ".length).trim();
        if (!description) {
          return { output: "Create what? Usage: ai create <description>", debug: undefined };
        }
        const players = game.store.findByTag("player");
        const player = players[0];
        if (!player) {
          return { output: "No player found.", debug: undefined };
        }
        const roomId = player.properties["location"] as string;
        const room = game.store.get(roomId);
        const result = await handleAiCreate(game.store, {
          description,
          room,
          gameId: input.gameId,
          debug: input.debug,
        });
        const roomDesc = describeCurrentRoom(game.store);
        return {
          output: roomDesc,
          aiOutput: result.output,
          debug:
            input.debug && result.debug
              ? {
                  parse: `ai create "${description}"`,
                  outcome: `created ${result.entityId}`,
                  aiFallback: {
                    systemPrompt: "",
                    prompt: result.debug.prompt,
                    response: result.debug.response,
                    durationMs: result.debug.durationMs,
                  },
                }
              : undefined,
        };
      }

      // Handle "ai destroy ..."
      if (trimmed.startsWith("ai destroy ")) {
        const objectName = trimmed.slice("ai destroy ".length).trim().toLowerCase();
        if (!objectName) {
          return { output: "Destroy what? Usage: ai destroy <object>", debug: undefined };
        }
        const aiIds = getAiEntityIds(input.gameId);
        let match: string | null = null;
        for (const id of aiIds) {
          if (!game.store.has(id)) continue;
          const entity = game.store.get(id);
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
          return {
            output: `No AI-created object matching "${objectName}" found.`,
            debug: undefined,
          };
        }
        const entity = game.store.get(match);
        const entityName = (entity.properties["name"] as string) || match;
        game.store.delete(match);
        removeAiEntity(input.gameId, match);
        return { output: `[Destroyed ${entityName} (${match})]`, debug: undefined };
      }

      // Normal command processing
      const result = processCommand(game.store, {
        input: trimmed,
        verbs: game.verbs,
        debug: input.debug,
      });

      if (result.unhandled) {
        const fallback = await handleVerbFallback(game.store, {
          command: result.unhandled.command,
          player: result.unhandled.player,
          room: result.unhandled.room,
          verbs: game.verbs,
          gameId: input.gameId,
          debug: input.debug,
        });
        // Record fallback events
        if (fallback.events.length > 0) {
          appendEventLog(input.gameId, {
            command: trimmed,
            events: fallback.events,
            timestamp: new Date().toISOString(),
          });
        }
        return {
          output: fallback.output,
          debug: result.debug
            ? {
                ...result.debug,
                outcome: fallback.handler ? `ai-${fallback.handler.name}` : "ai-fallback",
                aiFallback: fallback.debug,
              }
            : undefined,
        };
      }

      // Record events from the command
      if (result.events.length > 0) {
        appendEventLog(input.gameId, {
          command: trimmed,
          events: result.events,
          timestamp: new Date().toISOString(),
        });
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
});

export type AppRouter = typeof appRouter;
