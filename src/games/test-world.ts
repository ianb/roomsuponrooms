import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { registerGame } from "./registry.js";
import { loadGameData } from "../core/game-loader.js";
import type { GameData } from "../core/game-data.js";

const thisDir = import.meta.dirname!;
const data = JSON.parse(readFileSync(resolve(thisDir, "test-world.json"), "utf-8")) as GameData;

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
