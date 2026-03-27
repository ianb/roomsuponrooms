import { z } from "zod";
import { router, publicProcedure } from "./trpc.js";
import { describeRoomFull } from "../core/index.js";
import type { EntityStore } from "../core/index.js";
import { recordToHandler } from "./handler-convert.js";
import { applyEvents } from "./event-apply.js";
import { getStorage } from "./storage-instance.js";
import { composeVerbPrompt, composeCreatePrompt } from "./ai-prompts.js";
import type { GameInstance } from "../games/registry.js";
import { getGame, listGames, isValidGameId } from "../games/registry.js";
import { executeCommand } from "./execute-command.js";

// Game registrations are imported by the entry point (server/index.ts or worker.ts)
// NOT here, so the router can be used with either fs-based or bundled game data.

const activeGames: Map<string, GameInstance> = new Map();

class GameNotFoundError extends Error {
  constructor(public readonly slug: string) {
    super(`Game not found: ${slug}`);
    this.name = "GameNotFoundError";
  }
}

/** Apply AI entity records to the store (create or update) */
function applyAiEntities(
  records: Array<{ id: string; tags: string[]; properties: Record<string, unknown> }>,
  store: EntityStore,
): void {
  for (const record of records) {
    if (store.has(record.id)) {
      for (const [key, value] of Object.entries(record.properties)) {
        if (value === null) {
          store.removeProperty(record.id, key);
        } else {
          store.setProperty(record.id, { name: key, value });
        }
      }
    } else {
      store.create(record.id, {
        tags: record.tags,
        properties: record.properties,
      });
    }
  }
}

/** Create a fresh game instance, load AI entities, replay event log, load AI handlers */
async function initGame(slug: string): Promise<GameInstance> {
  const def = getGame(slug);
  if (!def) throw new GameNotFoundError(slug);
  const instance = def.create();
  const storage = getStorage();
  const aiEntities = await storage.loadAiEntities(slug);
  applyAiEntities(aiEntities, instance.store);
  instance.store.snapshot();
  const events = await storage.loadEvents(slug);
  for (const entry of events) {
    applyEvents(instance.store, entry.events);
  }
  const handlerRecords = await storage.loadAiHandlers(slug);
  for (const record of handlerRecords) {
    instance.verbs.register(recordToHandler(record));
  }
  return instance;
}

async function getOrCreateGame(slug: string): Promise<GameInstance> {
  const existing = activeGames.get(slug);
  if (existing) return existing;
  const instance = await initGame(slug);
  activeGames.set(slug, instance);
  return instance;
}

/** Reinitialize a game and update the active games map */
async function reinitGame(slug: string): Promise<GameInstance> {
  const instance = await initGame(slug);
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

const validGameId = z.string().refine(isValidGameId, { message: "Unknown game" });
const gameInput = z.object({ gameId: validGameId });

export const appRouter = router({
  games: publicProcedure.query(() => {
    return listGames().map((g) => ({
      slug: g.slug,
      title: g.title,
      description: g.description,
    }));
  }),

  look: publicProcedure.input(gameInput).query(async ({ input }) => {
    const game = await getOrCreateGame(input.gameId);
    return { output: describeCurrentRoom(game.store) };
  }),

  command: publicProcedure
    .input(z.object({ gameId: validGameId, text: z.string(), debug: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const game = await getOrCreateGame(input.gameId);
      try {
        return await executeCommand(input, { game, reinitGame });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[command] Error:", err);
        return { output: `{!Error: ${message}!}`, debug: undefined };
      }
    }),

  reset: publicProcedure.input(gameInput).mutation(async ({ input }) => {
    const instance = await reinitGame(input.gameId);
    return { output: describeCurrentRoom(instance.store) };
  }),

  entities: publicProcedure.input(gameInput).query(async ({ input }) => {
    const game = await getOrCreateGame(input.gameId);
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
    .input(z.object({ gameId: validGameId, id: z.string() }))
    .query(async ({ input }) => {
      const game = await getOrCreateGame(input.gameId);
      if (!game.store.has(input.id)) return null;
      const current = game.store.getSnapshot(input.id);
      const initial = game.store.getInitialState(input.id);
      return { current, initial };
    }),

  prompts: publicProcedure.input(gameInput).query(async ({ input }) => {
    const game = await getOrCreateGame(input.gameId);
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
