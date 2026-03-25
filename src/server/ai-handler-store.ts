import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Entity } from "../core/entity.js";
import type {
  ParsedCommand,
  VerbHandler,
  VerbContext,
  PerformResult,
  WorldEvent,
} from "../core/verb-types.js";
import type { VerbRegistry } from "../core/verbs.js";

export interface AiHandlerRecord {
  createdAt: string;
  gameId: string;
  decision: "perform" | "refuse";
  verb: string;
  form: ParsedCommand["form"];
  entityId?: string;
  /** Static message (used when there's no code) */
  message: string;
  eventTemplates: Array<{
    type: string;
    property: string;
    value: unknown;
    description: string;
  }>;
  /** JS function body string. Receives (context) and must return { output, events }. */
  code?: string;
}

function handlerFilePath(gameId: string): string {
  return resolve(process.cwd(), `data/ai-handlers-${gameId}.jsonl`);
}

function ensureDataDir(): void {
  const dataDir = resolve(process.cwd(), "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

export function saveHandlerRecord(record: AiHandlerRecord): void {
  ensureDataDir();
  appendFileSync(handlerFilePath(record.gameId), JSON.stringify(record) + "\n");
}

export function loadAiHandlers(gameId: string, verbs: VerbRegistry): void {
  const filePath = handlerFilePath(gameId);
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return;
  const records = content.split("\n").map((line) => JSON.parse(line) as AiHandlerRecord);
  for (const record of records) {
    verbs.register(recordToHandler(record));
  }
}

export function recordToHandler(record: AiHandlerRecord): VerbHandler {
  const handlerName =
    record.decision === "refuse"
      ? `ai-refuse:${record.verb}-${record.entityId || "intransitive"}`
      : `ai-perform:${record.verb}-${record.entityId || "intransitive"}`;

  return {
    name: handlerName,
    source: "ai-handler-store",
    pattern: { verb: record.verb, form: record.form },
    priority: -1,
    entityId: record.entityId,
    freeTurn: record.decision === "refuse",
    perform(context: VerbContext) {
      if (record.decision === "refuse") {
        return { output: record.message, events: [] };
      }

      // If there's code, evaluate it
      if (record.code) {
        return evaluateHandlerCode(record.code, context);
      }

      // Otherwise fall back to static message + event templates
      const target = getTarget(context);

      const events: WorldEvent[] = record.eventTemplates.map((t) => ({
        type: t.type,
        entityId: target ? target.id : "",
        property: t.property,
        value: t.value,
        oldValue: undefined,
        description: t.description,
      }));

      return { output: record.message, events };
    },
  };
}

function getTarget(context: VerbContext): Entity | null {
  if (context.command.form === "transitive" || context.command.form === "prepositional") {
    return context.command.object;
  }
  if (context.command.form === "ditransitive") {
    return context.command.object;
  }
  return null;
}

/**
 * Evaluate an AI-generated handler code string.
 * The code is a function body that receives a context object with:
 *   object, player, room, store, command
 * And must return { output: string, events: Array<{type, entityId, property, value, description}> }
 */
function evaluateHandlerCode(code: string, context: VerbContext): PerformResult {
  const target = getTarget(context);
  const fn = new Function("object", "player", "room", "store", "command", code);
  const result = fn(
    target,
    context.player,
    context.room,
    context.store,
    context.command,
  ) as PerformResult;
  // Ensure the result has the right shape
  if (!result || typeof result.output !== "string") {
    return { output: "Something strange happens, but nothing changes.", events: [] };
  }
  if (!Array.isArray(result.events)) {
    return { output: result.output, events: [] };
  }
  return result;
}
