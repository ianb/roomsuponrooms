import type { Entity, EntityStore } from "./entity.js";
import type { VerbContext, PerformResult, WorldEvent } from "./verb-types.js";
import { entityRef, itemDisplay, describeRoomFull } from "./describe.js";
import { isRoomLit, darknessDescription } from "./darkness.js";
import { renderTemplate } from "./templates.js";
import { BASE_LIB_DOCS } from "./handler-lib-docs.js";

export type { LibDoc } from "./handler-lib-docs.js";

/**
 * Standard library available to handler code strings as `lib`.
 * Constructed per handler invocation with the current context.
 */
export class HandlerLib {
  readonly store: EntityStore;
  readonly player: Entity;
  readonly room: Entity;

  static libDocs = BASE_LIB_DOCS;

  static describeLib(): string[] {
    return this.libDocs.map((d) => `lib.${d.signature} — ${d.description}`);
  }

  constructor(context: VerbContext) {
    this.store = context.store;
    this.player = context.player;
    this.room = context.room;
  }

  ref(entity: Entity): string {
    return entityRef(entity);
  }

  setEvent(
    entityId: string,
    { property, value, description }: { property: string; value: unknown; description: string },
  ): WorldEvent {
    return { type: "set-property", entityId, property, value, description };
  }

  moveEvent(
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

  createEvent(
    entityId: string,
    {
      tags,
      properties,
      description,
    }: { tags: string[]; properties: Record<string, unknown>; description: string },
  ): WorldEvent {
    return {
      type: "create-entity",
      entityId,
      value: { tags, properties },
      description,
    };
  }

  result(output: string): PerformResult {
    return { output, events: [] };
  }

  carried(): Entity[] {
    return this.store.getContents(this.player.id);
  }

  contents(entityId: string): Entity[] {
    return this.store.getContents(entityId);
  }

  findKey(obj: Entity): Entity | null {
    const keyId = obj.properties["unlockedBy"] as string | undefined;
    if (!keyId) return null;
    const key = this.store.tryGet(keyId);
    if (!key) return null;
    if (key.properties["location"] !== this.player.id) return null;
    return key;
  }

  checkCarryCapacity(): string | null {
    const capacity = (this.player.properties["carryingCapacity"] as number) || 0;
    if (capacity <= 0) return null;
    if (this.carried().length >= capacity) return "You're carrying too many things already.";
    return null;
  }

  describeRoom(): PerformResult {
    if (!isRoomLit(this.store, { room: this.room, playerId: this.player.id })) {
      return { output: darknessDescription(), events: [] };
    }
    return {
      output: describeRoomFull(this.store, { room: this.room, playerId: this.player.id }),
      events: [],
    };
  }

  examine(target: Entity): PerformResult {
    const rawDesc =
      (target.properties["description"] as string) ||
      `You see nothing special about the ${this.ref(target)}.`;
    const desc = renderTemplate(rawDesc, { entity: target, store: this.store });
    const parts = [desc];
    if (target.tags.has("container") && target.properties["open"] === true) {
      const items = this.store.getContents(target.id).filter((e) => !e.tags.has("exit"));
      if (items.length > 0) {
        parts.push(`It contains: ${items.map((e) => this.ref(e)).join(", ")}.`);
      } else {
        parts.push("It is empty.");
      }
    }
    return { output: parts.join("\n"), events: [] };
  }

  take(obj: Entity): PerformResult {
    const ref = this.ref(obj);
    const from = (obj.properties["location"] as string) || "void";
    return {
      output: `You take the ${ref}.`,
      events: [
        this.moveEvent(obj.id, { to: this.player.id, from, description: `Picked up ${ref}` }),
      ],
    };
  }

  drop(obj: Entity): PerformResult {
    const ref = this.ref(obj);
    return {
      output: `You drop the ${ref}.`,
      events: [
        this.moveEvent(obj.id, {
          to: this.room.id,
          from: this.player.id,
          description: `Dropped ${ref}`,
        }),
      ],
    };
  }

  showInventory(): PerformResult {
    const carried = this.carried();
    if (carried.length === 0) return { output: "You aren't carrying anything.", events: [] };
    const displays = carried.map((e) => itemDisplay(e, this.store));
    return { output: `You are carrying: ${displays.join(", ")}.`, events: [] };
  }

  open(obj: Entity): PerformResult {
    const ref = this.ref(obj);
    const events: WorldEvent[] = [
      this.setEvent(obj.id, { property: "open", value: true, description: `Opened ${ref}` }),
    ];
    const parts = [`You open the ${ref}.`];
    if (obj.tags.has("container")) {
      const items = this.store.getContents(obj.id).filter((e) => !e.tags.has("exit"));
      if (items.length > 0) {
        parts.push(`Inside you see: ${items.map((e) => this.ref(e)).join(", ")}.`);
      }
    }
    return { output: parts.join(" "), events };
  }

  close(obj: Entity): PerformResult {
    const ref = this.ref(obj);
    return {
      output: `You close the ${ref}.`,
      events: [
        this.setEvent(obj.id, { property: "open", value: false, description: `Closed ${ref}` }),
      ],
    };
  }

  putIn(obj: Entity, container: Entity): PerformResult {
    const objRef = this.ref(obj);
    const indRef = this.ref(container);
    return {
      output: `You put the ${objRef} in the ${indRef}.`,
      events: [
        this.moveEvent(obj.id, {
          to: container.id,
          from: this.player.id,
          description: `Put ${objRef} in ${indRef}`,
        }),
      ],
    };
  }

  takeFrom(obj: Entity, container: Entity): PerformResult {
    const objRef = this.ref(obj);
    const indRef = this.ref(container);
    return {
      output: `You take the ${objRef} from the ${indRef}.`,
      events: [
        this.moveEvent(obj.id, {
          to: this.player.id,
          from: container.id,
          description: `Took ${objRef} from ${indRef}`,
        }),
      ],
    };
  }

  unlockWith(obj: Entity, key: Entity): PerformResult {
    const events: WorldEvent[] = [
      this.setEvent(obj.id, {
        property: "locked",
        value: false,
        description: `Unlocked ${this.ref(obj)}`,
      }),
    ];
    const pairedId = obj.properties["pairedDoor"] as string | undefined;
    if (pairedId) {
      events.push(
        this.setEvent(pairedId, {
          property: "locked",
          value: false,
          description: "Unlocked paired door",
        }),
      );
    }
    return { output: `You unlock the ${this.ref(obj)} with the ${this.ref(key)}.`, events };
  }

  unlock(obj: Entity): PerformResult {
    const key = this.findKey(obj);
    if (!key) return this.result(`You don't have anything to unlock the ${this.ref(obj)} with.`);
    return this.unlockWith(obj, key);
  }

  lock(obj: Entity): PerformResult {
    const key = this.findKey(obj);
    if (!key) return this.result(`You don't have anything to lock the ${this.ref(obj)} with.`);
    return {
      output: `You lock the ${this.ref(obj)} with the ${this.ref(key)}.`,
      events: [
        this.setEvent(obj.id, {
          property: "locked",
          value: true,
          description: `Locked ${this.ref(obj)}`,
        }),
      ],
    };
  }

  switchOn(obj: Entity): PerformResult {
    const ref = this.ref(obj);
    return {
      output: `You turn on the ${ref}.`,
      events: [
        this.setEvent(obj.id, {
          property: "switchedOn",
          value: true,
          description: `Turned on ${ref}`,
        }),
        this.setEvent(obj.id, {
          property: "lit",
          value: true,
          description: `${ref} now provides light`,
        }),
      ],
    };
  }

  switchOff(obj: Entity): PerformResult {
    const ref = this.ref(obj);
    return {
      output: `You turn off the ${ref}.`,
      events: [
        this.setEvent(obj.id, {
          property: "switchedOn",
          value: false,
          description: `Turned off ${ref}`,
        }),
        this.setEvent(obj.id, {
          property: "lit",
          value: false,
          description: `${ref} no longer provides light`,
        }),
      ],
    };
  }

  showHelp(): PerformResult {
    return {
      output: [
        "Commands:",
        "  look/l            — Look around",
        "  examine/x <thing> — Examine something",
        "  go <dir>          — Move (or n/s/e/w/ne/nw/se/sw/up/down)",
        "  take/get <thing>  — Pick up",
        "  drop <thing>      — Put down",
        "  put <thing> in <container>",
        "  open/close <thing>",
        "  inventory/i       — Check what you are carrying",
        "  talk/use <thing>  — Talk to an NPC or device",
        "  score             — Show your score",
        "",
        'Type "help ai" for world-editing commands.',
      ].join("\n"),
      events: [],
    };
  }

  showScore(): PerformResult {
    const s = (this.player.properties["score"] as number) || 0;
    const maxScore = (this.player.properties["maxScore"] as number) || 0;
    if (maxScore > 0) return { output: `Your score is ${s} out of ${maxScore}.`, events: [] };
    return { output: `Your score is ${s}.`, events: [] };
  }

  incrementVisits(): PerformResult {
    const visits = (this.room.properties["visits"] as number) || 0;
    return {
      output: "",
      events: [
        this.setEvent(this.room.id, {
          property: "visits",
          value: visits + 1,
          description: `Visited ${this.ref(this.room)}`,
        }),
      ],
    };
  }
}
