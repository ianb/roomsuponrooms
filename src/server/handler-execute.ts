import type { EntityStore, Entity } from "../core/entity.js";
import type { ResolvedCommand, VerbHandler, WorldEvent } from "../core/verb-types.js";
import type { VerbRegistry } from "../core/verbs.js";
import type { AiHandlerRecord } from "./storage.js";
import { recordToHandler } from "./handler-convert.js";
import { getStorage } from "./storage-instance.js";

export interface ExecuteResult {
  output: string;
  events: WorldEvent[];
  handler: VerbHandler;
}

/** Convert the LLM response into a perform code string for HandlerData */
export function buildPerformCode(response: {
  decision: string;
  message: string;
  code?: string;
  events: Array<{ type: string; property: string; value: unknown; description: string }>;
}): string {
  // lib.* is async in the sandbox — generated code MUST await every call.
  if (response.decision === "refuse") {
    return `return await lib.result("{!" + ${JSON.stringify(response.message)} + "!}");`;
  }
  if (response.code) {
    return response.code;
  }
  if (response.events.length === 0) {
    return `return await lib.result(${JSON.stringify(response.message)});`;
  }
  const eventStrs = response.events.map(
    (e) =>
      `await lib.setEvent(object.id, ${JSON.stringify({ property: e.property, value: e.value, description: e.description })})`,
  );
  return `return { output: ${JSON.stringify(response.message)}, events: [${eventStrs.join(", ")}] };`;
}

/** Execute a handler immediately, save if successful, return null if it throws */
export async function executeAndSave(
  store: EntityStore,
  {
    record,
    verbs,
    command,
    player,
    room,
  }: {
    record: AiHandlerRecord;
    verbs: VerbRegistry;
    command: ResolvedCommand;
    player: Entity;
    room: Entity;
  },
): Promise<ExecuteResult | null> {
  const handler = recordToHandler(record);
  try {
    const performResult = await handler.perform({ store, command, player, room });
    // Apply events (also validates properties)
    for (const event of performResult.events) {
      if (event.type === "create-entity") {
        if (!store.has(event.entityId)) {
          const data = event.value as { tags: string[]; properties: Record<string, unknown> };
          store.create(event.entityId, { tags: data.tags, properties: data.properties });
        }
      } else if (event.type === "set-property" && event.property) {
        store.setProperty(event.entityId, { name: event.property, value: event.value });
      }
    }
    // Success — persist the handler
    await getStorage().saveHandler(record);
    verbs.register(handler);
    return { output: performResult.output, events: performResult.events, handler };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai-fallback] Handler execution failed:", msg);
    console.error("[ai-fallback] Broken handler code:", record.perform);
    return null;
  }
}
