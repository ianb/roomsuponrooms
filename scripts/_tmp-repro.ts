/** Temp: reproduce production initGame replay for the affected user. */
import { readFileSync } from "node:fs";
import "../src/games/the-aaru/index.js";
import { listGames } from "../src/games/registry.js";
import { applyAiEntityRecords } from "../src/server/apply-ai-records.js";
import { applyEvents } from "../src/server/event-apply.js";
import type { AiEntityRecord } from "../src/server/storage.js";

const def = listGames().find((g) => g.slug === "the-aaru")!;
const instance = def.create();

const entityLines = readFileSync("/tmp/aaru-repro/the-aaru/entities.jsonl", "utf8")
  .split("\n")
  .filter((l) => l.trim().length > 0);
const records = entityLines.map((l) => JSON.parse(l) as AiEntityRecord);
console.log(`Applying ${records.length} AI entity records...`);
applyAiEntityRecords(records, instance.store);
instance.store.snapshot();

const player = instance.store.findByTag("player")[0];
console.log("After AI records, player location:", player.location);

const eventsRaw = JSON.parse(readFileSync("/tmp/aaru-repro/events-raw.json", "utf8"));
const rows = eventsRaw[0].results as Array<{ seq: number; command: string; events: string }>;
for (const row of rows) {
  const events = JSON.parse(row.events);
  console.log(`replaying #${row.seq} (${row.command}): ${events.length} events`);
  try {
    applyEvents(instance.store, events);
  } catch (e) {
    console.log("  THREW:", e instanceof Error ? e.message : String(e));
  }
  console.log("  player location now:", instance.store.findByTag("player")[0].location);
}
