import type { EntityStore } from "../../core/entity.js";
import { WORLD_LOCATION } from "../../core/entity.js";

export interface RoomOptions {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  lit?: boolean;
}

export interface ExitOptions {
  from: string;
  direction: string;
  to: string;
}

export function room(store: EntityStore, options: RoomOptions): void {
  const extraTags = options.tags || [];
  const allTags = ["room", ...extraTags];
  const properties: Record<string, unknown> = {
    location: WORLD_LOCATION,
    name: options.name,
    description: options.description,
  };
  if (options.lit === true) {
    properties.lit = true;
  }
  store.create(options.id, { tags: allTags, properties });
}

export function exit(store: EntityStore, options: ExitOptions): void {
  const fromShort = options.from.replace("room:", "");
  store.create(`exit:${fromShort}:${options.direction}`, {
    tags: ["exit"],
    properties: {
      location: options.from,
      direction: options.direction,
      destination: options.to,
    },
  });
}

/** Aboveground room: automatically gets aboveground tag and lit property */
export function abovegroundRoom(store: EntityStore, options: RoomOptions): void {
  const extraTags = options.tags || [];
  room(store, {
    ...options,
    tags: ["aboveground", ...extraTags],
    lit: true,
  });
}

/** Underground room with default dwarfish tag */
export function undergroundRoom(store: EntityStore, options: RoomOptions): void {
  const extraTags = options.tags || [];
  const hasSafe = extraTags.includes("safe");
  const baseTags = hasSafe ? [] : ["dwarfish"];
  room(store, {
    ...options,
    tags: [...baseTags, ...extraTags],
  });
}
