import type { EntityStore, Entity } from "./entity.js";
import { evalTemplateSafe } from "./template-eval.js";

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
    return entity.tags.includes(tag);
  }

  function contents(): string[] {
    const children = store.getContents(entity.id);
    return children.filter((e) => !e.tags.includes("exit")).map((e) => e.name);
  }

  try {
    return evalTemplateSafe(template, { self, entity: entityLookup, has, contents });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(
      `[templates] Template eval failed for entity ${entity.id}: ${message} (template: ${JSON.stringify(template)})`,
    );
    return template;
  }
}

/**
 * Check if a string contains template expressions.
 */
export function hasTemplateExpressions(text: string): boolean {
  return text.includes("${");
}
