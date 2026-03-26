import { loadGameData } from "../../core/game-loader.js";
import { readGameDir } from "../read-game-dir.js";
import { registerGame } from "../registry.js";

const data = readGameDir(import.meta.dirname!);

registerGame({
  slug: data.meta.slug,
  title: data.meta.title,
  description: data.meta.description,
  create() {
    const game = loadGameData(data);
    game.store.snapshot();
    return game;
  },
});
