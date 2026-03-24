import { createSampleWorld } from "../core/sample-world.js";
import { registerGame } from "./registry.js";

registerGame({
  slug: "test",
  title: "Test World",
  description:
    "A small test world with a forest clearing, deep woods, hillside, and a locked cabin.",
  create: createSampleWorld,
});
