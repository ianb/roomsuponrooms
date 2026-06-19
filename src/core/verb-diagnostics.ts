import type {
  EntityRequirements,
  ResolvedCommand,
  VerbContext,
  VerbHandler,
} from "./verb-types.js";
import type { VerbRegistry } from "./verbs.js";
import {
  getCommandPrep,
  getDirectObject,
  getIndirectObject,
  involvesEntity,
  involvesTag,
  meetsRequirements,
  prepMatches,
} from "./command-matching.js";

/**
 * Explain why no handler matched a command. Returns up to `limit` candidate
 * handlers whose verb (or alias) matches the resolved command, with a short
 * reason for each rejection. Used by the playtest tool to give the agent a
 * fighting chance at diagnosing why its handler isn't dispatching.
 *
 * Lives outside VerbRegistry so verbs.ts can stay under the file-length cap;
 * it relies only on the public `list()` method.
 */
export async function diagnoseUnhandled(
  context: VerbContext,
  { verbs, limit }: { verbs: VerbRegistry; limit?: number },
): Promise<Array<{ handler: string; reason: string }>> {
  const cap = limit !== undefined ? limit : 8;
  const results: Array<{ handler: string; reason: string }> = [];
  for (const handler of verbs.list()) {
    if (results.length >= cap) break;
    const reason = await rejectionReason(handler, context);
    if (reason) results.push({ handler: handler.name, reason });
  }
  return results;
}

async function rejectionReason(handler: VerbHandler, context: VerbContext): Promise<string | null> {
  const verbMatches =
    handler.pattern.verb === context.command.verb ||
    (handler.pattern.verbAliases !== undefined &&
      handler.pattern.verbAliases.includes(context.command.verb));
  // We only care about handlers that *could* have applied — i.e. their verb
  // word matches the command. Anything else is noise.
  if (!verbMatches) return null;
  if (handler.pattern.form !== context.command.form) {
    return `wrong form: handler is ${handler.pattern.form}, command is ${context.command.form}`;
  }
  if (handler.pattern.prep) {
    const cmdPrep = getCommandPrep(context.command);
    if (!cmdPrep) {
      return `requires prep "${handler.pattern.prep}", command has none`;
    }
    if (!prepMatches(handler.pattern.prep, cmdPrep)) {
      return `wrong prep: handler wants "${handler.pattern.prep}", command has "${cmdPrep}"`;
    }
  }
  if (handler.entityId) {
    if (!involvesEntity(context.command, handler.entityId)) {
      return `requires entityId "${handler.entityId}", command involves ${describeInvolvedIds(context.command)}`;
    }
  }
  if (handler.tag) {
    if (!involvesTag(context.command, handler.tag)) {
      return `requires an involved entity tagged "${handler.tag}"; tags present: ${describeInvolvedTags(context.command)}`;
    }
  }
  if (handler.objectRequirements) {
    const obj = getDirectObject(context.command);
    if (!obj) return "requires a direct object, command has none";
    if (!meetsRequirements(obj, handler.objectRequirements)) {
      return `direct object "${obj.id}" failed objectRequirements ${describeRequirements(handler.objectRequirements)}`;
    }
  }
  if (handler.indirectRequirements) {
    const indirect = getIndirectObject(context.command);
    if (!indirect) return "requires an indirect object, command has none";
    if (!meetsRequirements(indirect, handler.indirectRequirements)) {
      return `indirect object "${indirect.id}" failed indirectRequirements ${describeRequirements(handler.indirectRequirements)}`;
    }
  }
  if (handler.check) {
    const check = await handler.check(context);
    if (!check.applies) return "check phase rejected (handler.check returned applies:false)";
  }
  // Pattern, specificity, and check all pass — handler should have applied.
  // Either it did and we shouldn't be in diagnoseUnhandled, or another
  // handler with the same priority took precedence.
  return null;
}

function describeInvolvedIds(command: ResolvedCommand): string {
  if (command.form === "transitive" || command.form === "prepositional") {
    return `"${command.object.id}"`;
  }
  if (command.form === "ditransitive") {
    return `"${command.object.id}", "${command.indirect.id}"`;
  }
  return "(no objects)";
}

function describeInvolvedTags(command: ResolvedCommand): string {
  const all: string[] = [];
  if (command.form === "transitive" || command.form === "prepositional") {
    all.push(...command.object.tags);
  } else if (command.form === "ditransitive") {
    all.push(...command.object.tags, ...command.indirect.tags);
  }
  if (all.length === 0) return "(none)";
  return all.join(", ");
}

function describeRequirements(reqs: EntityRequirements): string {
  const parts: string[] = [];
  if (reqs.tags && reqs.tags.length > 0) {
    parts.push(`tags=[${reqs.tags.join(", ")}]`);
  }
  if (reqs.properties) {
    const propEntries = Object.entries(reqs.properties).map(
      ([k, v]) => `${k}=${JSON.stringify(v)}`,
    );
    if (propEntries.length > 0) parts.push(`properties={${propEntries.join(", ")}}`);
  }
  return `{${parts.join(", ")}}`;
}
