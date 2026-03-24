import type { EntityStore } from "../../core/entity.js";

export interface ItemOptions {
  id: string;
  name: string;
  description: string;
  location: string;
  tags?: string[];
  aliases?: string[];
  portable?: boolean;
  properties?: Record<string, unknown>;
}

export function item(store: EntityStore, options: ItemOptions): void {
  const tags: string[] = ["item"];
  if (options.portable) {
    tags.push("portable");
  }
  if (options.tags) {
    tags.push(...options.tags);
  }
  const properties: Record<string, unknown> = {
    location: options.location,
    name: options.name,
    description: options.description,
  };
  if (options.aliases) {
    properties.aliases = options.aliases;
  }
  if (options.properties) {
    for (const [key, value] of Object.entries(options.properties)) {
      properties[key] = value;
    }
  }
  store.create(options.id, { tags, properties });
}
