import type { EntityStore, Entity } from "./entity.js";
import { evalTemplate } from "./sandbox.js";

/**
 * Evaluate template expressions in a string.
 *
 * Template syntax: ${...} where the expression has access to:
 * - `self` — the entity's properties
 * - `entity(id)` — look up another entity's properties
 * - `has(tag)` — check if the entity has a tag
 * - `contents()` — get names of entities inside this one
 */
export function renderTemplate(
  template: string,
  { entity, store }: { entity: Entity; store: EntityStore },
): string {
  // Fast path: no expressions
  if (!template.includes("${")) return template;

  const self = entity.properties;

  function entityLookup(id: string): Record<string, unknown> {
    const target = store.tryGet(id);
    if (!target) return {};
    return target.properties;
  }

  function has(tag: string): boolean {
    return entity.tags.has(tag);
  }

  function contents(): string[] {
    const children = store.getContents(entity.id);
    return children
      .filter((e) => !e.tags.has("exit"))
      .map((e) => (e.properties["name"] as string) || e.id);
  }

  try {
    return evalTemplate(template, { self, entity: entityLookup, has, contents });
  } catch (_e) {
    return template;
  }
}

/**
 * Check if a string contains template expressions.
 */
export function hasTemplateExpressions(text: string): boolean {
  return text.includes("${");
}
