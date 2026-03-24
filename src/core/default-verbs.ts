import type { Entity } from "./entity.js";
import type { VerbHandler, VerbContext, PerformResult, WorldEvent } from "./verbs.js";
import { VerbRegistry } from "./verbs.js";
import { SYSTEM_VERBS } from "./verb-types.js";
import { describeRoomFull, entityRef } from "./describe.js";
import { open, close, putIn, takeFrom, unlock, unlockWith, lock } from "./container-verbs.js";
import { switchOn, switchOff, turnOnPrep, turnOffPrep } from "./device-verbs.js";
import { isRoomLit, darknessDescription } from "./darkness.js";

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

function examinePerform(context: VerbContext): PerformResult {
  if (context.command.form !== "transitive") return { output: "Examine what?", events: [] };
  const target = context.command.object;
  const desc =
    (target.properties["description"] as string) ||
    `You see nothing special about the ${entityRef(target)}.`;
  const parts = [desc];
  if (target.tags.has("container") && target.properties["open"] === true) {
    const contents = context.store.getContents(target.id);
    const items = contents.filter((e: Entity) => !e.tags.has("exit"));
    if (items.length > 0) {
      parts.push(`It contains: ${itemRefs(items)}.`);
    } else {
      parts.push("It is empty.");
    }
  }
  return { output: parts.join("\n"), events: [] };
}

const lookRoom: VerbHandler = {
  name: "look",
  source: "default-verbs.ts",
  pattern: { verb: "look", verbAliases: ["l"], form: "intransitive" },
  priority: 0,
  freeTurn: true,
  perform(context: VerbContext): PerformResult {
    const { store, room } = context;
    if (!isRoomLit(store, { room, playerId: context.player.id })) {
      return { output: darknessDescription(), events: [] };
    }
    const output = describeRoomFull(store, { room, playerId: context.player.id });
    return { output, events: [] };
  },
};

const lookAt: VerbHandler = {
  name: "look-at",
  source: "default-verbs.ts",
  pattern: { verb: "look", verbAliases: ["l"], form: "prepositional", prep: "direction" },
  priority: 0,
  freeTurn: true,
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "prepositional") return { output: "Look at what?", events: [] };
    const target = context.command.object;
    const desc =
      (target.properties["description"] as string) ||
      `You see nothing special about the ${entityRef(target)}.`;
    return { output: desc, events: [] };
  },
};

const examine: VerbHandler = {
  name: "examine",
  source: "default-verbs.ts",
  pattern: { verb: "examine", verbAliases: ["x", "look", "l"], form: "transitive" },
  priority: 0,
  freeTurn: true,
  perform: examinePerform,
};

const take: VerbHandler = {
  name: "take",
  source: "default-verbs.ts",
  pattern: { verb: "take", verbAliases: ["get"], form: "transitive" },
  priority: 0,
  objectRequirements: { tags: ["portable"] },
  check(context: VerbContext) {
    if (context.command.form !== "transitive") return { applies: false };
    if (context.command.object.properties["location"] === context.player.id)
      return { applies: false };
    return { applies: true };
  },
  veto(context: VerbContext) {
    if (context.command.form !== "transitive") return { blocked: false };
    const capacity = (context.player.properties["carryingCapacity"] as number) || 0;
    if (capacity <= 0) return { blocked: false };
    const carried = context.store.getContents(context.player.id);
    if (carried.length >= capacity) {
      return { blocked: true, output: "You're carrying too many things already." };
    }
    return { blocked: false };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "transitive") return { output: "Take what?", events: [] };
    const obj = context.command.object;
    const ref = entityRef(obj);
    const from = (obj.properties["location"] as string) || "void";
    return {
      output: `You take the ${ref}.`,
      events: [moveEvent(obj.id, { to: context.player.id, from, description: `Picked up ${ref}` })],
    };
  },
};

const drop: VerbHandler = {
  name: "drop",
  source: "default-verbs.ts",
  pattern: { verb: "drop", form: "transitive" },
  priority: 0,
  check(context: VerbContext) {
    if (context.command.form !== "transitive") return { applies: false };
    if (context.command.object.properties["location"] !== context.player.id)
      return { applies: false };
    return { applies: true };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "transitive") return { output: "Drop what?", events: [] };
    const obj = context.command.object;
    const ref = entityRef(obj);
    return {
      output: `You drop the ${ref}.`,
      events: [
        moveEvent(obj.id, {
          to: context.room.id,
          from: context.player.id,
          description: `Dropped ${ref}`,
        }),
      ],
    };
  },
};

const inventory: VerbHandler = {
  name: "inventory",
  source: "default-verbs.ts",
  pattern: { verb: "inventory", verbAliases: ["i"], form: "intransitive" },
  priority: 0,
  freeTurn: true,
  perform(context: VerbContext): PerformResult {
    const carried = context.store.getContents(context.player.id);
    if (carried.length === 0) return { output: "You aren't carrying anything.", events: [] };
    return { output: `You are carrying: ${itemRefs(carried)}.`, events: [] };
  },
};

const help: VerbHandler = {
  name: "help",
  source: "default-verbs.ts",
  pattern: { verb: "help", form: "intransitive" },
  priority: 0,
  freeTurn: true,
  perform(): PerformResult {
    const lines = [
      "Commands:",
      "  look/l                - Look around the room",
      "  look/examine/x <thing> - Examine something",
      "  go <direction>        - Move (or just n/s/e/w)",
      "  take/get <thing>      - Pick something up",
      "  drop <thing>          - Put something down",
      "  put <thing> in <container> - Place item in container",
      "  take <thing> from <container> - Remove from container",
      "  open <thing>          - Open a door or container",
      "  close <thing>         - Close a door or container",
      "  inventory/i           - Check what you're carrying",
    ];
    return { output: lines.join("\n"), events: [] };
  },
};

const score: VerbHandler = {
  name: "score",
  source: "default-verbs.ts",
  pattern: { verb: "score", form: "intransitive" },
  priority: 0,
  freeTurn: true,
  perform(context: VerbContext): PerformResult {
    const s = (context.player.properties["score"] as number) || 0;
    const maxScore = (context.player.properties["maxScore"] as number) || 0;
    if (maxScore > 0) {
      return { output: `Your score is ${s} out of ${maxScore}.`, events: [] };
    }
    return { output: `Your score is ${s}.`, events: [] };
  },
};

function itemRefs(entities: Entity[]): string {
  return entities.map((e) => entityRef(e)).join(", ");
}

const enterRoom: VerbHandler = {
  name: "[enter]",
  source: "default-verbs.ts",
  pattern: { verb: SYSTEM_VERBS.ENTER, form: "intransitive" },
  priority: 0,
  perform(context: VerbContext): PerformResult {
    const room = context.room;
    const visits = (room.properties["visits"] as number) || 0;
    return {
      output: "",
      events: [
        {
          type: "set-property",
          entityId: room.id,
          property: "visits",
          value: visits + 1,
          oldValue: visits,
          description: `Visited ${entityRef(room)}`,
        },
      ],
    };
  },
};

export function createDefaultVerbs(): VerbRegistry {
  const registry = new VerbRegistry();
  const handlers = [
    lookRoom,
    lookAt,
    examine,
    take,
    takeFrom,
    drop,
    inventory,
    open,
    close,
    putIn,
    unlock,
    unlockWith,
    lock,
    help,
    score,
    switchOn,
    switchOff,
    turnOnPrep,
    turnOffPrep,
    enterRoom,
  ];
  for (const handler of handlers) {
    registry.register(handler);
  }
  return registry;
}
