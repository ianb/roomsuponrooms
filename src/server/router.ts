import { z } from "zod";
import { router, publicProcedure, authedProcedure } from "./trpc.js";
import { describeRoomFull } from "../core/index.js";
import type { EntityStore } from "../core/index.js";
import { playerStatus } from "../core/progression.js";
import { recordToHandler } from "./handler-convert.js";
import { applyAiEntityRecords } from "./apply-ai-records.js";
import { applyEvents } from "./event-apply.js";
import { getKnownEventCount, setKnownEventCount } from "./event-count.js";
import { getStorage } from "./storage-instance.js";
import { composeVerbPrompt, composeCreatePrompt, composeConversationPrompt } from "./ai-prompts.js";
import type { GameInstance } from "../games/registry.js";
import { getGame, listGames, isValidGameId } from "../games/registry.js";
import { executeCommand } from "./execute-command.js";
import { restoreConversationState } from "./conversation-commands.js";
import type { SessionKey } from "./storage.js";
import { logErrorObj } from "./error-log.js";
import { withSessionLock } from "./session-lock.js";
import { bugRouter } from "./router-bugs.js";
import { adminRouter } from "./router-admin.js";
import { imageRouter } from "./router-images.js";
import { agentRouter } from "./router-agent.js";

// Game registrations are imported by the entry point (server/index.ts or worker.ts)
// NOT here, so the router can be used with either fs-based or bundled game data.

/** Cache key is "gameSlug:userId" */
const activeGames: Map<string, GameInstance> = new Map();

class GameNotFoundError extends Error {
  constructor(public readonly slug: string) {
    super(`Game not found: ${slug}`);
    this.name = "GameNotFoundError";
  }
}

/** Create a fresh game instance for a specific user */
async function initGame(session: SessionKey): Promise<GameInstance> {
  const def = getGame(session.gameId);
  if (!def) throw new GameNotFoundError(session.gameId);
  const instance = def.create();
  const storage = getStorage();
  // AI entities and handlers are shared across all users
  const aiEntities = await storage.loadAiEntities(session.gameId);
  applyAiEntityRecords(aiEntities, instance.store);
  instance.store.snapshot();
  // Mark the starting room as visited so the map includes it
  const startPlayer = instance.store.findByTag("player")[0];
  if (startPlayer) {
    const startRoomId = startPlayer.location;
    if (startRoomId && instance.store.has(startRoomId)) {
      const startRoom = instance.store.get(startRoomId);
      if (startRoom.room) startRoom.room.visits = 1;
    }
  }
  // Events are per-user
  const events = await storage.loadEvents(session);
  setKnownEventCount(session, events.length);
  // Track the last unclosed start-conversation event so we can restore the
  // in-memory conversation state after replay (the state itself isn't
  // persisted, but the start/close markers are).
  let activeConversationNpc: string | null = null;
  for (const entry of events) {
    applyEvents(instance.store, entry.events);
    for (const ev of entry.events) {
      if (ev.type === "start-conversation") activeConversationNpc = ev.entityId;
      else if (ev.type === "close-conversation") activeConversationNpc = null;
    }
  }
  if (activeConversationNpc) {
    await restoreConversationState(instance, {
      npcId: activeConversationNpc,
      gameId: session.gameId,
    });
  }
  const handlerRecords = await storage.loadAiHandlers(session.gameId);
  for (const record of handlerRecords) {
    instance.verbs.register(recordToHandler(record));
  }
  return instance;
}

function cacheKey(session: SessionKey): string {
  return `${session.gameId}:${session.userId}`;
}

export async function getOrCreateGame(session: SessionKey): Promise<GameInstance> {
  const key = cacheKey(session);
  const existing = activeGames.get(key);
  if (existing && (await isCacheFresh(session))) return existing;
  const instance = await initGame(session);
  activeGames.set(key, instance);
  return instance;
}

/**
 * A cached instance is only trustworthy if no OTHER isolate has appended
 * events since we built (or last updated) it. Workers run many isolates
 * concurrently, each with its own activeGames map; without this check a
 * command served by one isolate leaves every other isolate's cached world
 * stale — players answered from rooms they already left. Appends made by
 * this isolate keep the known count in sync (see event-count.ts), so the
 * comparison only fails on foreign writes.
 */
async function isCacheFresh(session: SessionKey): Promise<boolean> {
  const known = getKnownEventCount(session);
  if (known === null) return false;
  const stored = await getStorage().countEvents(session);
  return stored === known;
}

/** Reinitialize a game for a user and update the cache */
export async function reinitGame(session: SessionKey): Promise<GameInstance> {
  const instance = await initGame(session);
  activeGames.set(cacheKey(session), instance);
  return instance;
}

function describeCurrentRoom(s: EntityStore): string {
  const players = s.findByTag("player");
  const player = players[0];
  if (!player) return "No player found.";
  const roomId = player.location;
  const room = s.get(roomId);
  return describeRoomFull(s, { room, playerId: player.id });
}

const validGameId = z.string().refine(isValidGameId, { message: "Unknown game" });
const gameInput = z.object({ gameId: validGameId });

const gameRouter = router({
  games: publicProcedure.query(() => {
    return listGames().map((g) => ({
      slug: g.slug,
      title: g.title,
      description: g.description,
      theme: g.theme || null,
      aiThinkingMessages: g.aiThinkingMessages || null,
    }));
  }),

  look: authedProcedure.input(gameInput).query(async ({ input, ctx }) => {
    const session = { gameId: input.gameId, userId: ctx.userId };
    const game = await getOrCreateGame(session);
    return { output: describeCurrentRoom(game.store) };
  }),

  command: authedProcedure
    .input(z.object({ gameId: validGameId, text: z.string(), debug: z.boolean().optional() }))
    .mutation(async ({ input, ctx }) => {
      const session = { gameId: input.gameId, userId: ctx.userId };
      try {
        return await withSessionLock(session, async () => {
          const game = await getOrCreateGame(session);
          return executeCommand(
            {
              gameId: input.gameId,
              userId: ctx.userId,
              text: input.text,
              debug: input.debug,
              roles: ctx.roles,
            },
            { game, reinitGame: (s: SessionKey) => reinitGame(s) },
          );
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await logErrorObj("command", {
          error: err,
          userId: ctx.userId || undefined,
          gameId: input.gameId,
          context: input.text,
        });
        return { output: `{!Error: ${message}!}`, debug: undefined };
      }
    }),

  reset: authedProcedure.input(gameInput).mutation(async ({ input, ctx }) => {
    const session = { gameId: input.gameId, userId: ctx.userId };
    const instance = await withSessionLock(session, () => reinitGame(session));
    return { output: describeCurrentRoom(instance.store) };
  }),

  entities: authedProcedure.input(gameInput).query(async ({ input, ctx }) => {
    const session = { gameId: input.gameId, userId: ctx.userId };
    const game = await getOrCreateGame(session);
    const ids = game.store.getAllIds();
    const players = game.store.findByTag("player");
    const playerRoomId = players[0] ? players[0].location || null : null;
    const items = ids.map((id) => {
      const snap = game.store.getSnapshot(id);
      const initial = game.store.getInitialState(id);
      const hasChanges =
        initial !== null && JSON.stringify(snap.properties) !== JSON.stringify(initial.properties);
      return {
        id: snap.id,
        name: snap.name,
        tags: snap.tags,
        location: snap.location || null,
        hasChanges,
      };
    });
    return { items, playerRoomId };
  }),

  entity: authedProcedure
    .input(z.object({ gameId: validGameId, id: z.string() }))
    .query(async ({ input, ctx }) => {
      const session = { gameId: input.gameId, userId: ctx.userId };
      const game = await getOrCreateGame(session);
      if (!game.store.has(input.id)) return null;
      const current = game.store.getSnapshot(input.id);
      const initial = game.store.getInitialState(input.id);
      return { current, initial };
    }),

  mapData: authedProcedure.input(gameInput).query(async ({ input, ctx }) => {
    const session = { gameId: input.gameId, userId: ctx.userId };
    const game = await getOrCreateGame(session);
    const store = game.store;
    const players = store.findByTag("player");
    const player = players[0];
    const currentRoomId = player ? player.location || "" : "";
    const roomIds = store.findByTag("room").map((r) => r.id);
    const rooms = roomIds.map((id) => {
      const room = store.get(id);
      const exits = store.getExits(id);
      return {
        id,
        name: room.name,
        visits: (room.room && room.room.visits) || 0,
        exits: exits.map((e) => ({
          direction: (e.exit && e.exit.direction) || "",
          destinationId: (e.exit && e.exit.destination) || null,
        })),
      };
    });
    return { rooms, currentRoomId };
  }),

  playerStanding: authedProcedure.input(gameInput).query(async ({ input, ctx }) => {
    const session = { gameId: input.gameId, userId: ctx.userId };
    const game = await getOrCreateGame(session);
    const players = game.store.findByTag("player");
    const player = players[0];
    if (!player) return { tracks: [] };
    return {
      tracks: playerStatus(game.store, { tracks: game.tracks || [], playerId: player.id }),
    };
  }),

  prompts: authedProcedure.input(gameInput).query(async ({ input, ctx }) => {
    const session = { gameId: input.gameId, userId: ctx.userId };
    const game = await getOrCreateGame(session);
    const players = game.store.findByTag("player");
    const player = players[0];
    if (!player)
      return {
        verb: "",
        create: "",
        conversation: "",
        world: null,
        worldVerb: null,
        worldCreate: null,
        worldConversation: null,
        region: null,
        regionConversation: null,
        room: null,
      };
    const roomId = player.location;
    const room = game.store.get(roomId);
    const promptCtx = { prompts: game.prompts, room, store: game.store };
    const roomPrompt = (room.ai && room.ai.prompt) || null;
    const regionId = room.location;
    let regionPrompt: string | null = null;
    let regionConversationPrompt: string | null = null;
    if (regionId && regionId !== "world" && game.store.has(regionId)) {
      const region = game.store.get(regionId);
      if (region.tags.includes("region")) {
        regionPrompt = (region.ai && region.ai.prompt) || null;
        regionConversationPrompt = (region.ai && region.ai.conversationPrompt) || null;
      }
    }
    return {
      verb: composeVerbPrompt(promptCtx),
      create: composeCreatePrompt(promptCtx),
      conversation: composeConversationPrompt(promptCtx),
      world: (game.prompts && game.prompts.world) || null,
      worldVerb: (game.prompts && game.prompts.worldVerb) || null,
      worldCreate: (game.prompts && game.prompts.worldCreate) || null,
      worldConversation: (game.prompts && game.prompts.worldConversation) || null,
      region: regionPrompt,
      regionConversation: regionConversationPrompt,
      room: roomPrompt,
    };
  }),
});

export const appRouter = router({
  ...gameRouter._def.procedures,
  ...bugRouter._def.procedures,
  ...adminRouter._def.procedures,
  ...imageRouter._def.procedures,
  ...agentRouter._def.procedures,
});

export type AppRouter = typeof appRouter;
