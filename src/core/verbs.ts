import { applySingleEvent } from "./apply-event.js";
import {
  getCommandPrep,
  getDirectObject,
  getIndirectObject,
  involvesEntity,
  involvesTag,
  meetsRequirements,
} from "./command-matching.js";
import type {
  ResolvedCommand,
  WorldEvent,
  VerbHandler,
  VerbContext,
  VerbPattern,
  DispatchResult,
} from "./verb-types.js";
import { resolvePrep } from "./command-parser.js";

export type {
  ParsedCommand,
  ResolvedCommand,
  CheckResult,
  VetoResult,
  PerformResult,
  WorldEvent,
  EntityRequirements,
  VerbPattern,
  VerbHandler,
  VerbContext,
  DispatchResult,
} from "./verb-types.js";

export { resolveCommand } from "./resolve.js";
export { parseCommand, PREP_GROUPS, resolvePrep } from "./command-parser.js";

// --- Verb registry and dispatch ---

export class VerbRegistry {
  private handlers: VerbHandler[] = [];

  register(handler: VerbHandler): void {
    this.handlers.push(handler);
  }

  removeByName(name: string): boolean {
    const idx = this.handlers.findIndex((h) => h.name === name);
    if (idx === -1) return false;
    this.handlers.splice(idx, 1);
    return true;
  }

  /** Return a defensive copy of all registered handlers. */
  list(): VerbHandler[] {
    return [...this.handlers];
  }

  /** Find a handler by its unique name. */
  getByName(name: string): VerbHandler | null {
    return this.handlers.find((h) => h.name === name) || null;
  }

  dispatch(context: VerbContext): DispatchResult {
    const candidates = this.findHandlers(context);
    const applicable = candidates.filter((h) => {
      if (!h.check) return true;
      return h.check(context).applies;
    });

    if (applicable.length === 0) {
      return { outcome: "unhandled" };
    }

    for (const handler of applicable) {
      if (handler.veto) {
        const veto = handler.veto(context);
        if (veto.blocked) {
          return { outcome: "vetoed", output: veto.output, vetoedBy: handler.name };
        }
      }
    }

    const performer = applicable[0];
    if (!performer) {
      return { outcome: "unhandled" };
    }

    let result;
    try {
      result = performer.perform(context);
      for (const event of result.events) {
        applySingleEvent(context.store, event);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[verbs] Handler "${performer.name}" threw: ${msg}`);
      // Remove broken AI handlers so they can be regenerated
      if (performer.name.startsWith("ai-")) {
        this.removeByName(performer.name);
        console.log(`[verbs] Removed broken handler: ${performer.name}`);
        return { outcome: "unhandled", removedBroken: { handler: performer.name, error: msg } };
      }
      // Non-AI handler errors still surface
      throw err as Error;
    }

    return {
      outcome: "performed",
      output: result.output,
      events: result.events,
      handler: performer.name,
      source: performer.source,
      freeTurn: result.freeTurn || performer.freeTurn || false,
    };
  }

  /** Dispatch a system verb like [enter] or [tick]. Returns combined output and events from all handlers. */
  dispatchSystem(verb: string, context: VerbContext): { outputs: string[]; events: WorldEvent[] } {
    const systemCommand: ResolvedCommand = {
      form: "intransitive",
      verb,
    };
    const systemContext: VerbContext = { ...context, command: systemCommand };
    const candidates = this.findHandlers(systemContext);
    const outputs: string[] = [];
    const allEvents: WorldEvent[] = [];

    for (const handler of candidates) {
      if (handler.check) {
        const check = handler.check(systemContext);
        if (!check.applies) continue;
      }
      const result = handler.perform(systemContext);
      if (result.output) {
        outputs.push(result.output);
      }
      for (const event of result.events) {
        allEvents.push(event);
        applySingleEvent(systemContext.store, event);
      }
    }
    return { outputs, events: allEvents };
  }

  /** Add a verb alias to all handlers that match a given verb */
  addVerbAlias(existingVerb: string, newAlias: string): void {
    for (const handler of this.handlers) {
      if (handler.pattern.verb === existingVerb) {
        if (!handler.pattern.verbAliases) {
          handler.pattern.verbAliases = [];
        }
        if (!handler.pattern.verbAliases.includes(newAlias)) {
          handler.pattern.verbAliases.push(newAlias);
        }
      }
    }
  }

  /** Find handlers that could match if the verb were different (for alias detection) */
  findAlternateVerbs(context: VerbContext): Array<{ verb: string; handler: string }> {
    const seen = new Set<string>();
    const results: Array<{ verb: string; handler: string }> = [];
    for (const handler of this.handlers) {
      // Skip if it already matches the current verb
      if (this.patternMatches(handler.pattern, context.command)) continue;
      // Check if it would match with a different verb (same form, same entities)
      if (handler.pattern.form !== context.command.form) continue;
      if (!this.specificityMatches(handler, context)) continue;
      const verb = handler.pattern.verb;
      if (seen.has(verb)) continue;
      seen.add(verb);
      results.push({ verb, handler: handler.name });
    }
    return results;
  }

  private findHandlers(context: VerbContext): VerbHandler[] {
    const { command } = context;
    const matched: VerbHandler[] = [];

    for (const handler of this.handlers) {
      if (!this.patternMatches(handler.pattern, command)) continue;
      if (!this.specificityMatches(handler, context)) continue;
      matched.push(handler);
    }

    matched.sort((a, b) => b.priority - a.priority);
    return matched;
  }

  private patternMatches(pattern: VerbPattern, command: ResolvedCommand): boolean {
    const verbMatches =
      pattern.verb === command.verb ||
      (pattern.verbAliases !== undefined && pattern.verbAliases.includes(command.verb));
    if (!verbMatches) return false;
    if (pattern.form !== command.form) return false;
    if (pattern.prep) {
      const commandPrep = getCommandPrep(command);
      if (!commandPrep) return false;
      const commandGroup = resolvePrep(commandPrep);
      if (pattern.prep !== commandPrep && pattern.prep !== commandGroup) {
        return false;
      }
    }
    return true;
  }

  private specificityMatches(handler: VerbHandler, context: VerbContext): boolean {
    if (handler.entityId) {
      if (!involvesEntity(context.command, handler.entityId)) return false;
    }
    if (handler.tag) {
      if (!involvesTag(context.command, handler.tag)) return false;
    }
    if (handler.objectRequirements) {
      const obj = getDirectObject(context.command);
      if (!obj) return false;
      if (!meetsRequirements(obj, handler.objectRequirements)) return false;
    }
    if (handler.indirectRequirements) {
      const indirect = getIndirectObject(context.command);
      if (!indirect) return false;
      if (!meetsRequirements(indirect, handler.indirectRequirements)) return false;
    }
    return true;
  }
}
