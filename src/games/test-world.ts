import { resolve } from "node:path";
import { registerGame } from "./registry.js";
import { readGameDir } from "./read-game-dir.js";
import { loadGameData } from "../core/game-loader.js";

const data = readGameDir(resolve(import.meta.dirname!, "test-world"));

registerGame({
  slug: data.meta.slug,
  title: data.meta.title,
  description: data.meta.description,
  hidden: data.meta.hidden,
  create() {
    const game = loadGameData(data);
    game.store.snapshot();
    return game;
  },
});
