/**
 * Live smoke test for the world-editing agent.
 *
 * Runs a single agent session against a real LLM and a local FileStorage.
 * Prints the resulting status, summary, and any committed entities.
 *
 * Usage:
 *   tsx --env-file=.env scripts/agent-smoke.ts <gameId> "<instructions>"
 *
 * Example:
 *   tsx --env-file=.env scripts/agent-smoke.ts test \
 *     "Find room:clearing, then add a hidden brass key item to it. \
 *      Set the key's properties: { weight: 1, hidden: true }. Use finish() when done."
 *
 * Requires:
 *   - LLM_PROVIDER and LLM_MODEL env vars (or llm-config.json)
 *   - The named game to be registered (test, the-aaru, tinkermarket, ...)
 */

import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { FileStorage } from "../src/server/storage-file.js";
import { setStorage, getStorage } from "../src/server/storage-instance.js";
import { tickSession } from "../src/server/agent-loop.js";
import { isValidGameId } from "../src/games/registry.js";

// Register all games for the FileStorage path.
import "../src/games/colossal-cave/index.js";
import "../src/games/the-aaru/index.js";
import "../src/games/tinkermarket/index.js";
import "../src/games/test-world.js";

async function main(): Promise<void> {
  const [gameId, instructions] = process.argv.slice(2);
  if (!gameId || !instructions) {
    console.error('Usage: tsx --env-file=.env scripts/agent-smoke.ts <gameId> "<instructions>"');
    process.exit(1);
  }
  if (!isValidGameId(gameId)) {
    console.error(`Unknown gameId: ${gameId}`);
    process.exit(1);
  }

  const dataDir = resolve(process.cwd(), "data");
  const userDataDir = resolve(process.cwd(), "userdata");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(userDataDir, { recursive: true });
  setStorage(new FileStorage({ dataDir, userDataDir }));

  const storage = getStorage();
  const id = "s-smoke-" + Date.now();
  const now = new Date().toISOString();
  await storage.createAgentSession({
    id,
    gameId,
    userId: "smoke-tester",
    request: instructions,
    status: "running",
    messages: [],
    savedVars: {},
    turnCount: 0,
    turnLimit: 30,
    summary: null,
    revertOf: null,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  });
  console.log(`[agent-smoke] session=${id} gameId=${gameId}`);
  console.log(`[agent-smoke] instructions: ${instructions}`);
  console.log(`[agent-smoke] running...`);

  let result = await tickSession(id);
  let safety = 0;
  let throttles = 0;
  while (result.status === "running" && safety < 20 && throttles < 8) {
    if (result.throttled) {
      throttles += 1;
      const delayMs = Math.min(5000 * 2 ** (throttles - 1), 60_000);
      console.log(`[agent-smoke] rate-limited; backing off ${delayMs / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } else {
      console.log(`[agent-smoke] tick ${safety + 1}: still running`);
      safety += 1;
    }
    result = await tickSession(id);
  }

  console.log("");
  console.log(`[agent-smoke] FINAL STATUS: ${result.status}`);
  console.log(`[agent-smoke] summary: ${result.summary || "(none)"}`);

  const session = await storage.getAgentSession(id);
  if (session) {
    console.log(`[agent-smoke] turns used: ${session.turnCount}/${session.turnLimit}`);
  }
  const edits = await storage.getSessionEdits(id);
  console.log(`[agent-smoke] edits emitted: ${edits.length}`);
  for (const e of edits) {
    const tag = e.applied ? "✓" : " ";
    console.log(`  ${tag} [${e.op}] ${e.targetKind}:${e.targetId}`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
