import { z } from "zod";
import type { EntityStore } from "../core/entity.js";
import type { JSONSchema7 } from "../core/json-schema.js";
import type { PropertyDefinition } from "../core/properties.js";

/** Format a property schema as a concise type string */
function formatSchemaType(schema: JSONSchema7): string {
  // entity-ref is a special case
  if (schema.type === "string" && schema.format === "entity-ref") {
    return "entity-ref";
  }

  // array of a single type
  if (schema.type === "array" && schema.items && typeof schema.items === "object") {
    const itemType = formatSchemaType(schema.items);
    return `${itemType}[]`;
  }

  // simple single type with no extra attributes
  if (typeof schema.type === "string") {
    const hasExtras =
      schema.enum !== undefined ||
      schema.minimum !== undefined ||
      schema.maximum !== undefined ||
      schema.minLength !== undefined ||
      schema.maxLength !== undefined ||
      schema.pattern !== undefined;
    if (!hasExtras) {
      return schema.type;
    }
  }

  // fallback: show the full schema
  return JSON.stringify(schema);
}

function formatPropertyDef(def: PropertyDefinition): string {
  const typeStr = formatSchemaType(def.schema);
  return `- ${def.name} (${typeStr}): ${def.description}`;
}

export function describeProperties(store: EntityStore): string {
  const defs = store.registry.definitions;
  return Object.values(defs).map(formatPropertyDef).join("\n");
}

/** Filter properties to only include those defined in the store's registry, skipping undefined */
export function filterKnownProperties(
  store: EntityStore,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    if (store.registry.definitions[key]) {
      result[key] = value;
    } else {
      console.warn(`[ai] Skipping unknown property: ${key}`);
    }
  }
  return result;
}

function jsonSchemaToZod(schema: JSONSchema7, description: string): z.ZodTypeAny {
  if (schema.type === "boolean") return z.boolean().optional().describe(description);
  if (schema.type === "number" || schema.type === "integer")
    return z.number().optional().describe(description);
  if (schema.type === "string") {
    if (schema.enum) {
      const values = schema.enum as string[];
      return z
        .enum(values as [string, ...string[]])
        .optional()
        .describe(description);
    }
    return z.string().optional().describe(description);
  }
  if (schema.type === "array") return z.array(z.unknown()).optional().describe(description);
  return z.unknown().optional().describe(description);
}

/**
 * Build a zod schema with explicit optional fields for each property in the registry.
 * Excludes properties that are already handled as top-level fields in the response schema.
 */
export function buildPropertiesSchema(
  store: EntityStore,
  { exclude }: { exclude: string[] },
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const excludeSet = new Set(exclude);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const def of Object.values(store.registry.definitions)) {
    if (excludeSet.has(def.name)) continue;
    // Skip entity-ref properties — the AI shouldn't set these directly
    if (def.schema.format === "entity-ref") continue;
    shape[def.name] = jsonSchemaToZod(def.schema, def.description);
  }
  return z.object(shape);
}

const REVERSE_DIRECTIONS: Record<string, string> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
  up: "down",
  down: "up",
  northeast: "southwest",
  southwest: "northeast",
  northwest: "southeast",
  southeast: "northwest",
};

export function reverseDirection(direction: string): string {
  return REVERSE_DIRECTIONS[direction.toLowerCase()] || "back";
}

export function collectTags(store: EntityStore): string[] {
  const tags = new Set<string>();
  const propertyNames = new Set(Object.keys(store.registry.definitions));
  for (const id of store.getAllIds()) {
    const entity = store.get(id);
    for (const tag of entity.tags) {
      if (!propertyNames.has(tag)) {
        tags.add(tag);
      }
    }
  }
  return Array.from(tags).toSorted();
}
