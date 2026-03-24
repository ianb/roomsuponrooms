import type { VerbHandler, VerbContext, PerformResult, WorldEvent } from "./verbs.js";
import { entityRef } from "./describe.js";

function setPropEvent(
  entityId: string,
  {
    property,
    value,
    oldValue,
    description,
  }: { property: string; value: unknown; oldValue: unknown; description: string },
): WorldEvent {
  return { type: "set-property", entityId, property, value, oldValue, description };
}

export const switchOn: VerbHandler = {
  name: "switch-on",
  source: "device-verbs.ts",
  pattern: { verb: "turn", verbAliases: ["switch", "light"], form: "transitive" },
  priority: 0,
  objectRequirements: { tags: ["device"] },
  check(context: VerbContext) {
    if (context.command.form !== "transitive") return { applies: false };
    // "turn X" is ambiguous — only match if not already on
    if (context.command.object.properties["switchedOn"] === true) return { applies: false };
    return { applies: true };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "transitive") return { output: "Turn on what?", events: [] };
    const obj = context.command.object;
    const ref = entityRef(obj);
    return {
      output: `You turn on the ${ref}.`,
      events: [
        setPropEvent(obj.id, {
          property: "switchedOn",
          value: true,
          oldValue: false,
          description: `Turned on ${ref}`,
        }),
        setPropEvent(obj.id, {
          property: "lit",
          value: true,
          oldValue: false,
          description: `${ref} now provides light`,
        }),
      ],
    };
  },
};

export const switchOff: VerbHandler = {
  name: "switch-off",
  source: "device-verbs.ts",
  pattern: { verb: "turn", verbAliases: ["switch", "extinguish", "douse"], form: "transitive" },
  priority: 0,
  objectRequirements: { tags: ["device"] },
  check(context: VerbContext) {
    if (context.command.form !== "transitive") return { applies: false };
    if (context.command.object.properties["switchedOn"] !== true) return { applies: false };
    return { applies: true };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "transitive") return { output: "Turn off what?", events: [] };
    const obj = context.command.object;
    const ref = entityRef(obj);
    return {
      output: `You turn off the ${ref}.`,
      events: [
        setPropEvent(obj.id, {
          property: "switchedOn",
          value: false,
          oldValue: true,
          description: `Turned off ${ref}`,
        }),
        setPropEvent(obj.id, {
          property: "lit",
          value: false,
          oldValue: true,
          description: `${ref} no longer provides light`,
        }),
      ],
    };
  },
};

export const turnOnPrep: VerbHandler = {
  name: "turn-on-prep",
  source: "device-verbs.ts",
  pattern: { verb: "turn", form: "prepositional", prep: "on" },
  priority: 5,
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "prepositional") return { output: "Turn on what?", events: [] };
    const obj = context.command.object;
    if (!obj.tags.has("device")) {
      return { output: "You can't turn that on.", events: [] };
    }
    if (obj.properties["switchedOn"] === true) {
      return { output: `The ${entityRef(obj)} is already on.`, events: [] };
    }
    // Delegate to switchOn by constructing the same result
    const ref = entityRef(obj);
    return {
      output: `You turn on the ${ref}.`,
      events: [
        setPropEvent(obj.id, {
          property: "switchedOn",
          value: true,
          oldValue: false,
          description: `Turned on ${ref}`,
        }),
        setPropEvent(obj.id, {
          property: "lit",
          value: true,
          oldValue: false,
          description: `${ref} now provides light`,
        }),
      ],
    };
  },
};

export const turnOffPrep: VerbHandler = {
  name: "turn-off-prep",
  source: "device-verbs.ts",
  pattern: { verb: "turn", form: "prepositional", prep: "from" },
  priority: 5,
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "prepositional") return { output: "Turn off what?", events: [] };
    const obj = context.command.object;
    if (!obj.tags.has("device")) {
      return { output: "You can't turn that off.", events: [] };
    }
    if (obj.properties["switchedOn"] !== true) {
      return { output: `The ${entityRef(obj)} is already off.`, events: [] };
    }
    const ref = entityRef(obj);
    return {
      output: `You turn off the ${ref}.`,
      events: [
        setPropEvent(obj.id, {
          property: "switchedOn",
          value: false,
          oldValue: true,
          description: `Turned off ${ref}`,
        }),
        setPropEvent(obj.id, {
          property: "lit",
          value: false,
          oldValue: true,
          description: `${ref} no longer provides light`,
        }),
      ],
    };
  },
};
