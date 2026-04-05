/**
 * Register all games from pre-bundled data (no fs access needed).
 * Used by the Cloudflare Worker entry point.
 */
import { loadGameData } from "../core/game-loader.js";
import { registerGame } from "./registry.js";
import { bundledGames } from "../../generated/bundled-data.js";

for (const data of bundledGames) {
  registerGame({
    slug: data.meta.slug,
    title: data.meta.title,
    description: data.meta.description,
    theme: data.meta.theme,
    aiThinkingMessages: data.meta.aiThinkingMessages,
    hidden: data.meta.hidden,
    create() {
      const game = loadGameData(data);
      game.store.snapshot();
      return game;
    },
  });
}
