import type { Entity } from "./entity.js";
import type { VerbHandler, VerbContext, PerformResult, WorldEvent } from "./verbs.js";
import { entityRef } from "./describe.js";

function moveEvent(
  entityId: string,
  { to, from, description }: { to: string; from: string; description: string },
): WorldEvent {
  return {
    type: "set-property",
    entityId,
    property: "location",
    value: to,
    oldValue: from,
    description,
  };
}

function setEvent(
  entityId: string,
  { property, value, description }: { property: string; value: unknown; description: string },
): WorldEvent {
  return { type: "set-property", entityId, property, value, description };
}

/** Build unlock events for an entity and its paired door (if any) */
function unlockEvents(obj: Entity): WorldEvent[] {
  const events: WorldEvent[] = [
    setEvent(obj.id, {
      property: "locked",
      value: false,
      description: `Unlocked ${entityRef(obj)}`,
    }),
  ];
  const pairedId = obj.properties["pairedDoor"] as string | undefined;
  if (pairedId) {
    events.push(
      setEvent(pairedId, {
        property: "locked",
        value: false,
        description: "Unlocked paired door",
      }),
    );
  }
  return events;
}

export const open: VerbHandler = {
  name: "open",
  source: "container-verbs.ts",
  pattern: { verb: "open", form: "transitive" },
  priority: 0,
  objectRequirements: { tags: ["openable"] },
  veto(context: VerbContext) {
    if (context.command.form !== "transitive") return { blocked: false };
    const obj = context.command.object;
    if (obj.properties["locked"] === true) {
      return { blocked: true, output: `The ${entityRef(obj)} is locked.` };
    }
    if (obj.properties["open"] === true) {
      return { blocked: true, output: `The ${entityRef(obj)} is already open.` };
    }
    return { blocked: false };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "transitive") return { output: "Open what?", events: [] };
    const obj = context.command.object;
    const ref = entityRef(obj);
    const events: WorldEvent[] = [
      setEvent(obj.id, { property: "open", value: true, description: `Opened ${ref}` }),
    ];
    const parts = [`You open the ${ref}.`];
    if (obj.tags.has("container")) {
      const contents = context.store.getContents(obj.id);
      const items = contents.filter((e: Entity) => !e.tags.has("exit"));
      if (items.length > 0) {
        const refs = items.map((e: Entity) => entityRef(e));
        parts.push(`Inside you see: ${refs.join(", ")}.`);
      }
    }
    return { output: parts.join(" "), events };
  },
};

export const close: VerbHandler = {
  name: "close",
  source: "container-verbs.ts",
  pattern: { verb: "close", form: "transitive" },
  priority: 0,
  objectRequirements: { tags: ["openable"] },
  veto(context: VerbContext) {
    if (context.command.form !== "transitive") return { blocked: false };
    const obj = context.command.object;
    if (obj.properties["open"] !== true) {
      return { blocked: true, output: `The ${entityRef(obj)} is already closed.` };
    }
    return { blocked: false };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "transitive") return { output: "Close what?", events: [] };
    const obj = context.command.object;
    const ref = entityRef(obj);
    return {
      output: `You close the ${ref}.`,
      events: [setEvent(obj.id, { property: "open", value: false, description: `Closed ${ref}` })],
    };
  },
};

export const putIn: VerbHandler = {
  name: "put-in",
  source: "container-verbs.ts",
  pattern: { verb: "put", form: "ditransitive", prep: "containment" },
  priority: 0,
  indirectRequirements: { tags: ["container"] },
  check(context: VerbContext) {
    if (context.command.form !== "ditransitive") return { applies: false };
    if (context.command.object.properties["location"] !== context.player.id)
      return { applies: false };
    return { applies: true };
  },
  veto(context: VerbContext) {
    if (context.command.form !== "ditransitive") return { blocked: false };
    const indirect = context.command.indirect;
    if (indirect.tags.has("openable") && indirect.properties["open"] !== true) {
      return { blocked: true, output: `The ${entityRef(indirect)} is closed.` };
    }
    return { blocked: false };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "ditransitive") return { output: "Put what where?", events: [] };
    const obj = context.command.object;
    const indirect = context.command.indirect;
    const objRef = entityRef(obj);
    const indRef = entityRef(indirect);
    return {
      output: `You put the ${objRef} in the ${indRef}.`,
      events: [
        moveEvent(obj.id, {
          to: indirect.id,
          from: context.player.id,
          description: `Put ${objRef} in ${indRef}`,
        }),
      ],
    };
  },
};

export const takeFrom: VerbHandler = {
  name: "take-from",
  source: "container-verbs.ts",
  pattern: { verb: "take", form: "ditransitive", prep: "source" },
  priority: 10,
  indirectRequirements: { tags: ["container"] },
  check(context: VerbContext) {
    if (context.command.form !== "ditransitive") return { applies: false };
    if (context.command.object.properties["location"] !== context.command.indirect.id)
      return { applies: false };
    return { applies: true };
  },
  veto(context: VerbContext) {
    if (context.command.form !== "ditransitive") return { blocked: false };
    const indirect = context.command.indirect;
    if (indirect.tags.has("openable") && indirect.properties["open"] !== true) {
      return { blocked: true, output: `The ${entityRef(indirect)} is closed.` };
    }
    return { blocked: false };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "ditransitive")
      return { output: "Take what from where?", events: [] };
    const obj = context.command.object;
    const indirect = context.command.indirect;
    const objRef = entityRef(obj);
    const indRef = entityRef(indirect);
    return {
      output: `You take the ${objRef} from the ${indRef}.`,
      events: [
        moveEvent(obj.id, {
          to: context.player.id,
          from: indirect.id,
          description: `Took ${objRef} from ${indRef}`,
        }),
      ],
    };
  },
};

// --- Unlock ---

function findKeyFor(obj: Entity, context: VerbContext): Entity | null {
  const keyId = obj.properties["unlockedBy"] as string | undefined;
  if (!keyId) return null;
  const key = context.store.tryGet(keyId);
  if (!key) return null;
  // Key must be carried by the player
  if (key.properties["location"] !== context.player.id) return null;
  return key;
}

/** "unlock X with Y" — explicit key */
export const unlockWith: VerbHandler = {
  name: "unlock-with",
  source: "container-verbs.ts",
  pattern: { verb: "unlock", form: "ditransitive", prep: "instrument" },
  priority: 0,
  objectRequirements: { properties: { locked: true } },
  veto(context: VerbContext) {
    if (context.command.form !== "ditransitive") return { blocked: false };
    const obj = context.command.object;
    const key = context.command.indirect;
    const requiredKey = obj.properties["unlockedBy"] as string | undefined;
    if (requiredKey && key.id !== requiredKey) {
      return { blocked: true, output: `The ${entityRef(key)} doesn't fit the ${entityRef(obj)}.` };
    }
    return { blocked: false };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "ditransitive") return { output: "Unlock what?", events: [] };
    const obj = context.command.object;
    const key = context.command.indirect;
    return {
      output: `You unlock the ${entityRef(obj)} with the ${entityRef(key)}.`,
      events: unlockEvents(obj),
    };
  },
};

/** "unlock X" — infers the key from inventory */
export const unlock: VerbHandler = {
  name: "unlock",
  source: "container-verbs.ts",
  pattern: { verb: "unlock", form: "transitive" },
  priority: 0,
  objectRequirements: { properties: { locked: true } },
  check(context: VerbContext) {
    if (context.command.form !== "transitive") return { applies: false };
    const obj = context.command.object;
    const key = findKeyFor(obj, context);
    if (!key) return { applies: false };
    return { applies: true };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "transitive") return { output: "Unlock what?", events: [] };
    const obj = context.command.object;
    const key = findKeyFor(obj, context);
    if (!key)
      return {
        output: `You don't have anything to unlock the ${entityRef(obj)} with.`,
        events: [],
      };
    return {
      output: `You unlock the ${entityRef(obj)} with the ${entityRef(key)}.`,
      events: unlockEvents(obj),
    };
  },
};

/** "lock X" — infers the key from inventory */
export const lock: VerbHandler = {
  name: "lock",
  source: "container-verbs.ts",
  pattern: { verb: "lock", form: "transitive" },
  priority: 0,
  objectRequirements: { tags: ["openable"], properties: { locked: false } },
  check(context: VerbContext) {
    if (context.command.form !== "transitive") return { applies: false };
    const obj = context.command.object;
    if (!obj.properties["unlockedBy"]) return { applies: false };
    const key = findKeyFor(obj, context);
    if (!key) return { applies: false };
    return { applies: true };
  },
  veto(context: VerbContext) {
    if (context.command.form !== "transitive") return { blocked: false };
    const obj = context.command.object;
    if (obj.properties["open"] === true) {
      return { blocked: true, output: `You need to close the ${entityRef(obj)} first.` };
    }
    return { blocked: false };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "transitive") return { output: "Lock what?", events: [] };
    const obj = context.command.object;
    const key = findKeyFor(obj, context);
    if (!key)
      return { output: `You don't have anything to lock the ${entityRef(obj)} with.`, events: [] };
    return {
      output: `You lock the ${entityRef(obj)} with the ${entityRef(key)}.`,
      events: [
        setEvent(obj.id, {
          property: "locked",
          value: true,
          description: `Locked ${entityRef(obj)}`,
        }),
      ],
    };
  },
};
