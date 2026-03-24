import { z } from "zod";
import { router, publicProcedure } from "./trpc.js";
import { processCommand, describeRoomFull } from "../core/index.js";
import type { EntityStore } from "../core/index.js";
import type { GameInstance } from "../games/registry.js";
import { getGame, listGames } from "../games/registry.js";

// Import game registrations
import "../games/test-world.js";

const activeGames: Map<string, GameInstance> = new Map();

class GameNotFoundError extends Error {
  constructor(public readonly slug: string) {
    super(`Game not found: ${slug}`);
    this.name = "GameNotFoundError";
  }
}

function getOrCreateGame(slug: string): GameInstance {
  const existing = activeGames.get(slug);
  if (existing) return existing;
  const def = getGame(slug);
  if (!def) throw new GameNotFoundError(slug);
  const instance = def.create();
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
    .mutation(({ input }) => {
      const game = getOrCreateGame(input.gameId);
      const result = processCommand(game.store, {
        input: input.text,
        verbs: game.verbs,
        debug: input.debug,
      });
      return { output: result.output, debug: result.debug };
    }),

  reset: publicProcedure.input(gameInput).mutation(({ input }) => {
    const def = getGame(input.gameId);
    if (!def) throw new GameNotFoundError(input.gameId);
    const instance = def.create();
    activeGames.set(input.gameId, instance);
    return { output: describeCurrentRoom(instance.store) };
  }),

  entities: publicProcedure.input(gameInput).query(({ input }) => {
    const game = getOrCreateGame(input.gameId);
    const ids = game.store.getAllIds();
    return ids.map((id) => {
      const snap = game.store.getSnapshot(id);
      return { id: snap.id, name: (snap.properties["name"] as string) || snap.id, tags: snap.tags };
    });
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
