import { getGame } from "../games/registry.js";
import type { GameInstance } from "../games/registry.js";
import { getStorage } from "./storage-instance.js";
import { applyAiEntityRecords } from "./apply-ai-records.js";
import { recordToHandler } from "./handler-convert.js";

export class GameNotFoundError extends Error {
  override name = "GameNotFoundError";
  constructor(public readonly slug: string) {
    super(`Game not found: ${slug}`);
  }
}

/**
 * Build a fresh game instance for a given gameId, with all materialized AI
 * entities and handlers applied. The instance is independent — caller can
 * mutate it freely without affecting any other live game state.
 *
 * Used by the agent loop (for the agent's read-merge view) and by the
 * playtest tool (for sandboxed simulations).
 */
export async function loadAgentGameInstance(gameId: string): Promise<GameInstance> {
  const def = getGame(gameId);
  if (!def) throw new GameNotFoundError(gameId);
  const instance = def.create();
  const storage = getStorage();
  const aiEntities = await storage.loadAiEntities(gameId);
  applyAiEntityRecords(aiEntities, instance.store);
  const handlerRecords = await storage.loadAiHandlers(gameId);
  for (const record of handlerRecords) {
    instance.verbs.register(recordToHandler(record));
  }
  return instance;
}
