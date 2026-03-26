import type { Entity } from "./entity.js";
import type {
  ParsedCommand,
  ResolvedCommand,
  WorldEvent,
  VerbHandler,
  VerbContext,
  VerbPattern,
  EntityRequirements,
  DispatchResult,
} from "./verb-types.js";

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

// --- Preposition groups ---

export const PREP_GROUPS: Record<string, string[]> = {
  containment: ["in", "into", "inside"],
  surface: ["on", "onto"],
  target: ["to", "toward", "towards"],
  instrument: ["with", "using"],
  source: ["from", "out of"],
  direction: ["at", "toward", "towards"],
  beneath: ["under", "beneath", "below"],
};

function resolvePrep(prep: string): string {
  for (const [group, members] of Object.entries(PREP_GROUPS)) {
    if (members.includes(prep)) return group;
  }
  return prep;
}

// --- Prepositions ---

const PREPOSITIONS = new Set([
  "in",
  "on",
  "off",
  "to",
  "with",
  "at",
  "from",
  "under",
  "into",
  "onto",
]);

// --- Compound verbs (two-word verbs treated as a single verb) ---

const COMPOUND_VERBS = new Set(["turn on", "turn off", "pick up", "put on", "take off"]);

// --- Parser ---

export function parseCommand(input: string): ParsedCommand | null {
  const words = input.trim().toLowerCase().split(/\s+/);
  if (words.length === 0) return null;

  let verb = words[0];
  if (!verb) return null;

  // Check for compound verbs (e.g. "turn on lamp" → verb="turn-on", object="lamp")
  let verbWordCount = 1;
  if (words.length >= 2) {
    const compound = `${words[0]} ${words[1]}`;
    if (COMPOUND_VERBS.has(compound)) {
      verb = `${words[0]}-${words[1]}`;
      verbWordCount = 2;
    }
  }

  const rest = words.slice(verbWordCount);
  if (rest.length === 0) {
    return { form: "intransitive", verb };
  }

  for (let i = 0; i < rest.length; i++) {
    const word = rest[i];
    if (word && PREPOSITIONS.has(word)) {
      const before = rest.slice(0, i).join(" ");
      const after = rest.slice(i + 1).join(" ");

      if (!after) return null;

      if (before) {
        return { form: "ditransitive", verb, object: before, prep: word, indirect: after };
      }
      return { form: "prepositional", verb, prep: word, object: after };
    }
  }

  const object = rest.join(" ");
  return { form: "transitive", verb, object };
}

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
    const result = performer.perform(context);

    for (const event of result.events) {
      if (event.type === "create-entity") {
        if (!context.store.has(event.entityId)) {
          const data = event.value as { tags: string[]; properties: Record<string, unknown> };
          context.store.create(event.entityId, { tags: data.tags, properties: data.properties });
        }
      } else if (event.type === "set-property") {
        if (event.property) {
          context.store.setProperty(event.entityId, { name: event.property, value: event.value });
        }
      } else if (event.type === "remove-property") {
        if (event.property) {
          context.store.removeProperty(event.entityId, event.property);
        }
      }
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
        if (event.type === "create-entity") {
          if (!systemContext.store.has(event.entityId)) {
            const data = event.value as { tags: string[]; properties: Record<string, unknown> };
            systemContext.store.create(event.entityId, {
              tags: data.tags,
              properties: data.properties,
            });
          }
        } else if (event.type === "set-property" && event.property) {
          systemContext.store.setProperty(event.entityId, {
            name: event.property,
            value: event.value,
          });
        } else if (event.type === "remove-property" && event.property) {
          systemContext.store.removeProperty(event.entityId, event.property);
        }
      }
    }
    return { outputs, events: allEvents };
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
      const commandPrep = this.getCommandPrep(command);
      if (!commandPrep) return false;
      const commandGroup = resolvePrep(commandPrep);
      if (pattern.prep !== commandPrep && pattern.prep !== commandGroup) {
        return false;
      }
    }
    return true;
  }

  private getCommandPrep(command: ResolvedCommand): string | null {
    if (command.form === "ditransitive") return command.prep;
    if (command.form === "prepositional") return command.prep;
    return null;
  }

  private specificityMatches(handler: VerbHandler, context: VerbContext): boolean {
    if (handler.entityId) {
      if (!this.involvesEntity(context.command, handler.entityId)) return false;
    }
    if (handler.tag) {
      if (!this.involvesTag(context.command, handler.tag)) return false;
    }
    if (handler.objectRequirements) {
      const obj = this.getDirectObject(context.command);
      if (!obj) return false;
      if (!this.meetsRequirements(obj, handler.objectRequirements)) return false;
    }
    if (handler.indirectRequirements) {
      const indirect = this.getIndirectObject(context.command);
      if (!indirect) return false;
      if (!this.meetsRequirements(indirect, handler.indirectRequirements)) return false;
    }
    return true;
  }

  private meetsRequirements(entity: Entity, reqs: EntityRequirements): boolean {
    if (reqs.tags) {
      for (const tag of reqs.tags) {
        if (!entity.tags.has(tag)) return false;
      }
    }
    if (reqs.properties) {
      for (const [key, expected] of Object.entries(reqs.properties)) {
        if (entity.properties[key] !== expected) return false;
      }
    }
    return true;
  }

  private getDirectObject(command: ResolvedCommand): Entity | null {
    if (command.form === "transitive" || command.form === "prepositional") return command.object;
    if (command.form === "ditransitive") return command.object;
    return null;
  }

  private getIndirectObject(command: ResolvedCommand): Entity | null {
    if (command.form === "ditransitive") return command.indirect;
    return null;
  }

  private involvesEntity(command: ResolvedCommand, entityId: string): boolean {
    if (command.form === "transitive" || command.form === "prepositional") {
      return command.object.id === entityId;
    }
    if (command.form === "ditransitive") {
      return command.object.id === entityId || command.indirect.id === entityId;
    }
    return false;
  }

  private involvesTag(command: ResolvedCommand, tag: string): boolean {
    if (command.form === "transitive" || command.form === "prepositional") {
      return command.object.tags.has(tag);
    }
    if (command.form === "ditransitive") {
      return command.object.tags.has(tag) || command.indirect.tags.has(tag);
    }
    return false;
  }
}
