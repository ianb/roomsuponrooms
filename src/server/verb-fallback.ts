import { generateObject } from "ai";
import { z } from "zod";
import type { EntityStore, Entity } from "../core/entity.js";
import type { ResolvedCommand, VerbHandler, VerbContext, WorldEvent } from "../core/verb-types.js";
import type { VerbRegistry } from "../core/verbs.js";
import { getLlm, getLlmProviderOptions } from "./llm.js";
import type { AiHandlerRecord, AuthoringInfo } from "./storage.js";
import { recordToHandler } from "./handler-convert.js";
import { getStorage } from "./storage-instance.js";
import { executeAndSave, buildPerformCode } from "./handler-execute.js";
import type { HandlerLib } from "../core/handler-lib.js";
import type { GamePrompts } from "../core/game-data.js";
import { buildSystemPrompt, buildFallbackPrompt, describeCommand } from "./verb-fallback-prompt.js";

export interface FallbackDebugInfo {
  systemPrompt: string;
  prompt: string;
  response: unknown;
  schema?: unknown;
  durationMs: number;
}

export interface FallbackResult {
  output: string;
  notes?: string;
  events: WorldEvent[];
  handler: VerbHandler | null;
  debug?: FallbackDebugInfo;
}

const fallbackResponseSchema = z.object({
  decision: z.enum(["perform", "refuse", "alias"]).describe(
    `"perform" if the action makes physical/logical sense for this type of object.
"refuse" if you understand the intent but the action shouldn't work.
"alias" if this verb is just a synonym for an existing verb listed in <existing-verbs>. Use the aliasOf field to specify which verb.`,
  ),
  aliasOf: z
    .string()
    .optional()
    .describe("Only for alias: the existing verb this is a synonym for."),
  message: z
    .string()
    .describe(
      "For refuse: the refusal message. For perform without code: a static result message. For perform with code: a brief description of what the handler does (not shown to player). For alias: leave empty.",
    ),
  code: z
    .string()
    .optional()
    .describe(
      "JavaScript function body for perform handlers that need conditional logic. Only used when decision is 'perform'. Has access to lib, object, indirect, player, room, store, command. Must return { output: string, events: WorldEvent[] }.",
    ),
  events: z
    .array(
      z.object({
        type: z.enum(["set-property"]),
        property: z.string(),
        value: z.unknown(),
        description: z.string(),
      }),
    )
    .describe(
      "Static property changes. Used for simple perform handlers without code. Properties must exist in the registry.",
    ),
  verbAliases: z
    .array(z.string())
    .describe(
      "Other verbs that should behave the same way. Only for perform/refuse. E.g. if creating a 'wear' handler, aliases might be ['don', 'put on']. Don't include verbs that already have handlers.",
    ),
  notes: z
    .string()
    .describe(
      "Your reasoning about this decision. Explain what choices you made and why. Flag if the action felt ambiguous, if you were unsure about the object's capabilities, if the handler might not generalize well, or if you think the world data may be missing something. This is shown to the game designer, not the player.",
    ),
});

/**
 * Ask the LLM to handle an unrecognized verb+object combination.
 * If the LLM decides the action should work, a new VerbHandler is registered
 * so the same action will work again without another LLM call.
 */
export async function handleVerbFallback(
  store: EntityStore,
  {
    command,
    player,
    room,
    verbs,
    gameId,
    libClass,
    prompts,
    debug,
    aiInstructions,
    authoring,
  }: {
    command: ResolvedCommand;
    player: Entity;
    room: Entity;
    verbs: VerbRegistry;
    gameId: string;
    libClass: typeof HandlerLib;
    prompts?: GamePrompts;
    debug?: boolean;
    aiInstructions?: string;
    authoring?: AuthoringInfo;
  },
): Promise<FallbackResult> {
  const systemPrompt = buildSystemPrompt(libClass, { prompts, room, store });
  const context: VerbContext = { store, command, player, room };
  const alternateVerbs = verbs.findAlternateVerbs(context);
  const prompt = buildFallbackPrompt(store, { command, room, alternateVerbs, aiInstructions });

  console.log("[ai-fallback] Calling LLM for:", describeCommand(command));
  const startTime = Date.now();

  const result = await generateObject({
    model: getLlm(),
    schema: fallbackResponseSchema,
    system: systemPrompt,
    prompt,
    providerOptions: getLlmProviderOptions(),
  });

  const durationMs = Date.now() - startTime;
  const response = result.object;

  console.log(
    `[ai-fallback] Decision: ${response.decision} (${durationMs}ms) — "${response.message}"`,
  );

  const debugInfo: FallbackDebugInfo | undefined = debug
    ? { systemPrompt, prompt, response, schema: z.toJSONSchema(fallbackResponseSchema), durationMs }
    : undefined;
  const notes = response.notes || undefined;

  // Handle alias — add verb as alias to existing handler and re-dispatch
  if (response.decision === "alias" && response.aliasOf) {
    console.log(`[ai-fallback] Registering "${command.verb}" as alias for "${response.aliasOf}"`);
    verbs.addVerbAlias(response.aliasOf, command.verb);
    // Re-dispatch with the alias now registered
    const aliasResult = verbs.dispatch(context);
    if (aliasResult.outcome === "performed") {
      return {
        output: aliasResult.output,
        notes,
        events: aliasResult.events,
        handler: null,
        debug: debugInfo,
      };
    }
    // Alias didn't work — fall through to create a new handler
    console.log("[ai-fallback] Alias dispatch failed, falling through to create handler");
  }

  const targetEntity =
    command.form === "transitive" || command.form === "prepositional"
      ? command.object
      : command.form === "ditransitive"
        ? command.object
        : null;

  const handlerPrefix = response.decision === "refuse" ? "ai-refuse" : "ai-perform";
  const entitySuffix = targetEntity ? targetEntity.id : "intransitive";

  // Filter aliases to exclude verbs that already have handlers
  const existingVerbs = new Set(alternateVerbs.map((v) => v.verb));
  existingVerbs.add(command.verb);
  const newAliases = (response.verbAliases || []).filter((a) => !existingVerbs.has(a));

  const record: AiHandlerRecord = {
    createdAt: new Date().toISOString(),
    gameId,
    name: `${handlerPrefix}:${command.verb}-${entitySuffix}`,
    pattern: {
      verb: command.verb,
      form: command.form,
      ...(newAliases.length > 0 ? { verbAliases: newAliases } : {}),
    },
    priority: -1,
    freeTurn: response.decision === "refuse",
    entityId: targetEntity ? targetEntity.id : undefined,
    perform: buildPerformCode(response),
    authoring,
  };

  if (response.decision === "refuse") {
    await getStorage().saveHandler(record);
    const handler = recordToHandler(record);
    verbs.register(handler);
    return { output: `{!${response.message}!}`, notes, events: [], handler, debug: debugInfo };
  }

  // Execute immediately — if it throws, delete and retry once
  const execResult = await executeAndSave(store, {
    record,
    verbs,
    command,
    player,
    room,
  });
  if (execResult) {
    return { ...execResult, notes, debug: debugInfo };
  }
  // First attempt failed — retry with simpler handler
  console.log("[ai-fallback] Retrying after handler error...");
  const retryPrompt =
    prompt +
    "\n\n<retry>Previous handler threw an error. Generate a simpler handler — prefer static messages over code, avoid setting properties that might not exist.</retry>";
  const retryResp = await generateObject({
    model: getLlm(),
    schema: fallbackResponseSchema,
    system: systemPrompt,
    prompt: retryPrompt,
    providerOptions: getLlmProviderOptions(),
  });
  const retryRecord: AiHandlerRecord = { ...record, perform: buildPerformCode(retryResp.object) };
  const retryExec = await executeAndSave(store, {
    record: retryRecord,
    verbs,
    command,
    player,
    room,
  });
  if (retryExec) {
    return { ...retryExec, notes, debug: debugInfo };
  }
  return {
    output: "{!Something went wrong trying to do that. Try a different approach.!}",
    notes,
    events: [],
    handler: null,
    debug: debugInfo,
  };
}
