import type { Entity, EntityStore } from "./entity.js";
import type { VerbContext, PerformResult, WorldEvent } from "./verb-types.js";
import { entityRef, itemDisplay, describeRoomFull } from "./describe.js";
import { isRoomLit, darknessDescription } from "./darkness.js";
import { renderTemplate } from "./templates.js";
import { BASE_LIB_DOCS, HELP_TEXT } from "./handler-lib-docs.js";
import { requireString, requireEntity, requireOpts } from "./handler-lib-guards.js";
import * as actions from "./handler-lib-actions.js";

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
    requireEntity(entity, "lib.ref() entity");
    return entityRef(entity);
  }

  setEvent(
    entityId: string,
    opts: { property: string; value: unknown; description: string },
  ): WorldEvent {
    requireString(entityId, "lib.setEvent() entityId");
    const o = requireOpts(opts, "lib.setEvent()");
    return {
      type: "set-property",
      entityId,
      property: (o.property as string) || "",
      value: o.value,
      description: (o.description as string) || "",
    };
  }

  /**
   * Award points to a named progression track (e.g. "craft", "reputation").
   * Returns a set-property event carrying the new absolute total, so the
   * change persists on replay. The meter must be a declared game property.
   * There is no universal score — every track is game-defined.
   */
  award(track: string, delta: number): WorldEvent {
    requireString(track, "lib.award() track");
    const d = typeof delta === "number" ? delta : 0;
    const current = (this.player.properties[track] as number) || 0;
    return {
      type: "set-property",
      entityId: this.player.id,
      property: track,
      value: current + d,
      description: `${d >= 0 ? "+" : ""}${d} ${track}`,
    };
  }

  moveEvent(entityId: string, opts: { to: string; from: string; description: string }): WorldEvent {
    requireString(entityId, "lib.moveEvent() entityId");
    const o = requireOpts(opts, "lib.moveEvent()");
    return {
      type: "set-property",
      entityId,
      property: "location",
      value: requireString(o.to, "lib.moveEvent() to"),
      oldValue: o.from as string,
      description: (o.description as string) || "",
    };
  }

  createEvent(
    entityId: string,
    opts: { tags: string[]; properties: Record<string, unknown>; description: string },
  ): WorldEvent {
    requireString(entityId, "lib.createEvent() entityId");
    const o = requireOpts(opts, "lib.createEvent()");
    return {
      type: "create-entity",
      entityId,
      value: { tags: o.tags, properties: o.properties },
      description: (o.description as string) || "",
    };
  }

  result(output: string): PerformResult {
    return { output: typeof output === "string" ? output : String(output), events: [] };
  }

  carried(): Entity[] {
    return this.store.getContents(this.player.id);
  }

  contents(entityId: string): Entity[] {
    if (typeof entityId !== "string" || !this.store.has(entityId)) return [];
    return this.store.getContents(entityId);
  }

  findKey(obj: Entity): Entity | null {
    if (!obj || typeof obj !== "object") return null;
    const keyId = obj.properties.unlockedBy;
    if (!keyId) return null;
    const key = this.store.tryGet(keyId);
    if (!key) return null;
    if (key.location !== this.player.id) return null;
    return key;
  }

  checkCarryCapacity(): string | null {
    const capacity = this.player.properties.carryingCapacity || 0;
    if (capacity <= 0) return null;
    if (this.carried().length >= capacity) return "{!You're carrying too many things already.!}";
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
    requireEntity(target, "lib.examine() target");
    const rawDesc = target.description || `You see nothing special about the ${this.ref(target)}.`;
    const desc = renderTemplate(rawDesc, { entity: target, store: this.store });
    const parts = [desc];
    if (target.tags.includes("container") && target.properties.open) {
      const items = this.store.getContents(target.id).filter((e) => !e.tags.includes("exit"));
      if (items.length > 0) {
        parts.push(`It contains: ${items.map((e) => this.ref(e)).join(", ")}.`);
      } else {
        parts.push("It is empty.");
      }
    }
    return { output: parts.join("\n"), events: [] };
  }

  take(obj: Entity): PerformResult {
    requireEntity(obj, "lib.take() object");
    const ref = this.ref(obj);
    return {
      output: `You take the ${ref}.`,
      events: [
        this.moveEvent(obj.id, {
          to: this.player.id,
          from: obj.location,
          description: `Picked up ${ref}`,
        }),
      ],
    };
  }

  drop(obj: Entity): PerformResult {
    requireEntity(obj, "lib.drop() object");
    const ref = this.ref(obj);
    const events: WorldEvent[] = [];
    if (obj.properties.worn) {
      events.push(
        this.setEvent(obj.id, { property: "worn", value: false, description: `Removed ${ref}` }),
      );
    }
    events.push(
      this.moveEvent(obj.id, {
        to: this.room.id,
        from: this.player.id,
        description: `Dropped ${ref}`,
      }),
    );
    return { output: `You drop the ${ref}.`, events };
  }

  showInventory(): PerformResult {
    const carried = this.carried();
    if (carried.length === 0) return { output: "You aren't carrying anything.", events: [] };
    const displays = carried.map((e) => itemDisplay(e, this.store));
    return { output: `You are carrying: ${displays.join(", ")}.`, events: [] };
  }

  open(obj: Entity): PerformResult {
    requireEntity(obj, "lib.open() object");
    const ref = this.ref(obj);
    const events: WorldEvent[] = [
      this.setEvent(obj.id, { property: "open", value: true, description: `Opened ${ref}` }),
    ];
    const parts = [`You open the ${ref}.`];
    if (obj.tags.includes("container")) {
      const items = this.store.getContents(obj.id).filter((e) => !e.tags.includes("exit"));
      if (items.length > 0) {
        parts.push(`Inside you see: ${items.map((e) => this.ref(e)).join(", ")}.`);
      }
    }
    return { output: parts.join(" "), events };
  }

  close(obj: Entity): PerformResult {
    requireEntity(obj, "lib.close() object");
    const ref = this.ref(obj);
    return {
      output: `You close the ${ref}.`,
      events: [
        this.setEvent(obj.id, { property: "open", value: false, description: `Closed ${ref}` }),
      ],
    };
  }

  putIn(obj: Entity, container: Entity): PerformResult {
    requireEntity(obj, "lib.putIn() object");
    requireEntity(container, "lib.putIn() container");
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
    requireEntity(obj, "lib.takeFrom() object");
    requireEntity(container, "lib.takeFrom() container");
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
    return actions.unlockWith(this, { obj, key });
  }
  unlock(obj: Entity): PerformResult {
    return actions.unlock(this, obj);
  }
  lock(obj: Entity): PerformResult {
    return actions.lock(this, obj);
  }
  switchOn(obj: Entity): PerformResult {
    return actions.switchOn(this, obj);
  }
  switchOff(obj: Entity): PerformResult {
    return actions.switchOff(this, obj);
  }
  wear(obj: Entity): PerformResult {
    return actions.wear(this, obj);
  }

  showHelp(): PerformResult {
    return { output: HELP_TEXT, events: [] };
  }
  showScore(): PerformResult {
    const s = this.player.properties.score || 0;
    const max = this.player.properties.maxScore || 0;
    return {
      output: max > 0 ? `Your score is ${s} out of ${max}.` : `Your score is ${s}.`,
      events: [],
    };
  }
  incrementVisits(): PerformResult {
    const visits = (this.room.room && this.room.room.visits) || 0;
    return {
      output: "",
      events: [
        this.setEvent(this.room.id, { property: "visits", value: visits + 1, description: "" }),
      ],
    };
  }
}
