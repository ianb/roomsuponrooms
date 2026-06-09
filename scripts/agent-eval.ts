/**
 * Eval harness for the world-editing agent loop.
 *
 * Runs one scenario against a real LLM in a CLEAN temporary data directory
 * (base game data only — no accumulated AI edits), then objectively verifies
 * the committed world with a playtest script and records metrics.
 *
 * Usage:
 *   tsx --env-file=.env scripts/agent-eval.ts <scenario> [flags]
 *   tsx scripts/agent-eval.ts --list
 *
 * Flags:
 *   --provider <google|anthropic|openrouter>   override LLM provider
 *   --model <id>                               override model id
 *   --label <text>                             free-text note stored with the result
 *   --turn-limit <n>                           override scenario turn limit
 *   --keep                                     keep the temp data dir for inspection
 *
 * Results append to eval-results/results.jsonl; the full session transcript
 * and materialized world files are copied to eval-results/runs/<runId>/.
 */

import { resolve, join } from "node:path";
import { mkdtempSync, mkdirSync, rmSync, cpSync, existsSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { FileStorage } from "../src/server/storage-file.js";
import { setStorage, getStorage } from "../src/server/storage-instance.js";
import { tickSession } from "../src/server/agent-loop.js";
import { runPlaytest } from "../src/server/agent-tool-playtest.js";
import { loadAgentGameInstance } from "../src/server/agent-game-loader.js";
import { computeCost } from "../src/server/agent-pricing.js";
import type { ToolContext } from "../src/server/agent-tool-context.js";
import { SCENARIOS, getScenario } from "./eval-scenarios.js";
import type { EvalScenario, VerifyScript, VerifyStep } from "./eval-scenarios.js";

import "../src/games/colossal-cave/index.js";
import "../src/games/the-aaru/index.js";
import "../src/games/tinkermarket/index.js";
import "../src/games/test-world.js";

interface Flags {
  provider?: string;
  model?: string;
  label?: string;
  turnLimit?: number;
  keep: boolean;
}

function parseArgs(argv: string[]): { scenario: string; flags: Flags } {
  const flags: Flags = { keep: false };
  let scenario = "";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv.at(i)!;
    if (arg === "--list") {
      for (const s of SCENARIOS) console.log(`${s.name}  (${s.gameId}, ${s.turnLimit} turns)`);
      process.exit(0);
    } else if (arg === "--provider") flags.provider = argv.at(++i);
    else if (arg === "--model") flags.model = argv.at(++i);
    else if (arg === "--label") flags.label = argv.at(++i);
    else if (arg === "--turn-limit") flags.turnLimit = Number(argv.at(++i));
    else if (arg === "--keep") flags.keep = true;
    else if (!scenario) scenario = arg;
  }
  if (!scenario) {
    console.error("Usage: tsx --env-file=.env scripts/agent-eval.ts <scenario> [flags]");
    process.exit(1);
  }
  return { scenario, flags };
}

interface StepResult {
  command: string;
  outcome: string;
  pass: boolean;
  why?: string;
}

interface PlaytestStepView {
  command: string;
  outcome: string;
  output?: string;
}

function judgeStep(step: VerifyStep, actual: PlaytestStepView | undefined): StepResult {
  if (!actual) {
    return { command: step.command, outcome: "(not run)", pass: false, why: "aborted earlier" };
  }
  const result: StepResult = { command: step.command, outcome: actual.outcome, pass: true };
  if (step.expectOutcome && !step.expectOutcome.includes(actual.outcome)) {
    result.pass = false;
    result.why = `expected ${step.expectOutcome.join("|")}, got ${actual.outcome}`;
  }
  if (step.notOutcome && step.notOutcome.includes(actual.outcome)) {
    result.pass = false;
    result.why = `forbidden outcome ${actual.outcome}`;
  }
  const output = actual.output || "";
  if (step.outputContains && !output.toLowerCase().includes(step.outputContains.toLowerCase())) {
    result.pass = false;
    result.why = `output missing "${step.outputContains}"`;
  }
  return result;
}

async function runVerifyScript(
  script: VerifyScript,
  ctx: { gameId: string },
): Promise<{ label: string; pass: boolean; steps: StepResult[] }> {
  const game = await loadAgentGameInstance(ctx.gameId);
  const toolContext: ToolContext = {
    storage: getStorage(),
    gameId: ctx.gameId,
    userId: "eval-verifier",
    sessionId: "eval-verify",
    store: game.store,
    verbs: game.verbs,
    pendingEdits: [],
    savedVars: {},
    terminate: null,
    editsSinceLastPlaytest: false,
  };
  const result = await runPlaytest(toolContext, {
    setup: script.setup,
    commands: script.steps.map((s) => s.command),
  });
  if (!("steps" in result)) {
    return {
      label: script.label,
      pass: false,
      steps: script.steps.map((s) => ({
        command: s.command,
        outcome: "(playtest error)",
        pass: false,
        why: result.error,
      })),
    };
  }
  const actualSteps = result.steps as PlaytestStepView[];
  const judged = script.steps.map((s, i) => judgeStep(s, actualSteps.at(i)));
  let pass = judged.every((j) => j.pass);
  if (script.finalLocation) {
    const final = (result as { finalState?: { playerLocation?: string } }).finalState;
    const loc = final ? final.playerLocation : undefined;
    if (loc !== script.finalLocation) {
      pass = false;
      judged.push({
        command: "(final location)",
        outcome: loc || "(unknown)",
        pass: false,
        why: `expected ${script.finalLocation}`,
      });
    }
  }
  return { label: script.label, pass, steps: judged };
}

interface TranscriptStats {
  toolCalls: Record<string, number>;
  editRejects: number;
  playtests: { total: number; unhandled: number; unresolved: number; error: number };
}

function analyzeTranscript(messages: unknown[]): TranscriptStats {
  const stats: TranscriptStats = {
    toolCalls: {},
    editRejects: 0,
    playtests: { total: 0, unhandled: 0, unresolved: 0, error: 0 },
  };
  for (const m of messages as Array<{ role: string; content: unknown }>) {
    if (!Array.isArray(m.content)) continue;
    for (const part of m.content as Array<Record<string, unknown>>) {
      if (m.role === "assistant" && part["type"] === "tool-call") {
        const name = String(part["toolName"]);
        stats.toolCalls[name] = (stats.toolCalls[name] || 0) + 1;
      }
      if (m.role === "tool") {
        const name = String(part["toolName"]);
        const out = JSON.stringify(part["output"]);
        if (name === "apply_edits" && out.includes('\\"ok\\":false')) stats.editRejects++;
        if (name === "apply_edits" && out.includes('"ok":false')) stats.editRejects++;
        if (name === "playtest") {
          stats.playtests.total++;
          if (out.includes('"outcome":"unhandled"')) stats.playtests.unhandled++;
          if (out.includes('"outcome":"unresolved"')) stats.playtests.unresolved++;
          if (out.includes('"outcome":"error"')) stats.playtests.error++;
        }
      }
    }
  }
  return stats;
}

async function runScenario(scenario: EvalScenario, flags: Flags): Promise<void> {
  if (flags.provider) process.env["LLM_PROVIDER"] = flags.provider;
  if (flags.model) process.env["LLM_MODEL"] = flags.model;

  const dataDir = mkdtempSync(join(tmpdir(), "rur-eval-"));
  const userDataDir = mkdtempSync(join(tmpdir(), "rur-eval-user-"));
  setStorage(new FileStorage({ dataDir, userDataDir }));
  const storage = getStorage();

  const runId = `eval-${scenario.name}-${Date.now()}`;
  const now = new Date().toISOString();
  const turnLimit = flags.turnLimit || scenario.turnLimit;
  await storage.createAgentSession({
    id: runId,
    gameId: scenario.gameId,
    userId: "eval",
    request: scenario.request,
    status: "running",
    messages: [],
    savedVars: {},
    turnCount: 0,
    turnLimit,
    summary: null,
    revertOf: null,
    model: null,
    systemPrompt: null,
    tokenUsage: {
      inputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
    },
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  });

  console.log(
    `[eval] run=${runId} provider=${process.env["LLM_PROVIDER"]} model=${process.env["LLM_MODEL"]}`,
  );
  const startMs = Date.now();
  let result = await tickSession(runId);
  let safety = 0;
  while (result.status === "running" && safety < 20) {
    result = await tickSession(runId);
    safety += 1;
  }
  const wallMs = Date.now() - startMs;

  const session = (await storage.getAgentSession(runId))!;
  const stats = analyzeTranscript(session.messages);
  const cost = computeCost(session.model, session.tokenUsage);

  const verify: Array<{ label: string; pass: boolean; steps: StepResult[] }> = [];
  if (result.status === "finished") {
    for (const script of scenario.verify) {
      verify.push(await runVerifyScript(script, { gameId: scenario.gameId }));
    }
  }
  const verifyPass = result.status === "finished" && verify.every((v) => v.pass);

  // Preserve artifacts.
  const runsDir = resolve(process.cwd(), "eval-results", "runs", runId);
  mkdirSync(runsDir, { recursive: true });
  const gameDataDir = join(dataDir, scenario.gameId);
  if (existsSync(gameDataDir)) cpSync(gameDataDir, runsDir, { recursive: true });

  const record = {
    ts: now,
    runId,
    scenario: scenario.name,
    provider: process.env["LLM_PROVIDER"] || "(config)",
    model: session.model,
    label: flags.label || null,
    status: result.status,
    summary: result.summary,
    verifyPass,
    verify: verify.map((v) => ({
      label: v.label,
      pass: v.pass,
      steps: v.steps.map((s) => ({ ...s })),
    })),
    turns: session.turnCount,
    turnLimit,
    tokenUsage: session.tokenUsage,
    costUsd: cost ? Number(cost.totalUsd.toFixed(4)) : null,
    wallMs,
    toolCalls: stats.toolCalls,
    editRejects: stats.editRejects,
    playtests: stats.playtests,
  };
  appendFileSync(
    resolve(process.cwd(), "eval-results", "results.jsonl"),
    JSON.stringify(record) + "\n",
  );

  console.log("");
  console.log(
    `[eval] status=${result.status} verifyPass=${verifyPass} turns=${session.turnCount}/${turnLimit} wall=${(wallMs / 1000).toFixed(1)}s`,
  );
  console.log(
    `[eval] tokens in=${session.tokenUsage.inputTokens} (cached ${session.tokenUsage.cacheReadTokens}) out=${session.tokenUsage.outputTokens} cost=${cost ? "$" + cost.totalUsd.toFixed(4) : "unknown"}`,
  );
  console.log(
    `[eval] tools=${JSON.stringify(stats.toolCalls)} editRejects=${stats.editRejects} playtests=${JSON.stringify(stats.playtests)}`,
  );
  for (const v of verify) {
    console.log(`[verify] ${v.pass ? "PASS" : "FAIL"} ${v.label}`);
    for (const s of v.steps) {
      console.log(
        `    ${s.pass ? "ok " : "FAIL"} ${s.command} → ${s.outcome}${s.why ? ` (${s.why})` : ""}`,
      );
    }
  }
  console.log(`[eval] artifacts: eval-results/runs/${runId}/`);

  if (flags.keep) {
    console.log(`[eval] temp data kept at ${dataDir}`);
  } else {
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const { scenario: name, flags } = parseArgs(process.argv.slice(2));
  const scenario = getScenario(name);
  if (!scenario) {
    console.error(`Unknown scenario: ${name}. Use --list to see options.`);
    process.exit(1);
  }
  await runScenario(scenario, flags);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
