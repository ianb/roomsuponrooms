import { loadGameData } from "../../core/game-loader.js";
import { readGameDir } from "../read-game-dir.js";
import { registerGame } from "../registry.js";
import { createCaveLib, ColossalCaveLib } from "./cave-lib.js";

const data = readGameDir(import.meta.dirname!);

registerGame({
  slug: data.meta.slug,
  title: data.meta.title,
  description: data.meta.description,
  theme: data.meta.theme,
  create() {
    const game = loadGameData(data, { libFactory: createCaveLib, libClass: ColossalCaveLib });
    game.store.snapshot();
    return game;
  },
});
