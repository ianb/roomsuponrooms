import Ajv from "ajv";
import type { JSONSchema7 } from "./json-schema.js";

export interface PropertyDefinition {
  name: string;
  description: string;
  schema: JSONSchema7;
  unit?: string;
  defaultValue?: unknown;
}

export interface PropertyRegistry {
  definitions: Record<string, PropertyDefinition>;
}

export class PropertyValidationError extends Error {
  constructor(
    public readonly propertyName: string,
    public readonly reason: string,
  ) {
    super(`Invalid value for property "${propertyName}": ${reason}`);
    this.name = "PropertyValidationError";
  }
}

export class UndefinedPropertyError extends Error {
  constructor(public readonly propertyName: string) {
    super(`Property "${propertyName}" is not defined in the registry`);
    this.name = "UndefinedPropertyError";
  }
}

const ajv = new Ajv({ allErrors: true, formats: { "entity-ref": true } });

export function createRegistry(definitions?: PropertyDefinition[]): PropertyRegistry {
  const registry: PropertyRegistry = { definitions: {} };
  if (definitions) {
    for (const def of definitions) {
      registry.definitions[def.name] = def;
    }
  }
  return registry;
}

export function defineProperty(registry: PropertyRegistry, definition: PropertyDefinition): void {
  registry.definitions[definition.name] = definition;
}

export function validateValue(
  registry: PropertyRegistry,
  entry: { name: string; value: unknown },
): string[] {
  const def = registry.definitions[entry.name];
  if (!def) {
    return [`Property "${entry.name}" is not defined in the registry`];
  }
  const validate = ajv.compile(def.schema);
  if (validate(entry.value)) {
    return [];
  }
  return (validate.errors || []).map((e) => `${entry.name}${e.instancePath}: ${e.message}`);
}

export type PropertyBag = Record<string, unknown>;

export function getProperty<T>(
  bag: PropertyBag,
  lookup: { registry: PropertyRegistry; name: string },
): T | undefined {
  if (!lookup.registry.definitions[lookup.name]) {
    throw new UndefinedPropertyError(lookup.name);
  }
  return bag[lookup.name] as T | undefined;
}

export function setProperty(
  bag: PropertyBag,
  assignment: { registry: PropertyRegistry; name: string; value: unknown },
): PropertyBag {
  const errors = validateValue(assignment.registry, {
    name: assignment.name,
    value: assignment.value,
  });
  if (errors.length > 0) {
    throw new PropertyValidationError(assignment.name, errors.join("; "));
  }
  return { ...bag, [assignment.name]: assignment.value };
}

export function getPropertyWithDefault<T>(
  bag: PropertyBag,
  lookup: { registry: PropertyRegistry; name: string },
): T {
  const def = lookup.registry.definitions[lookup.name];
  if (!def) {
    throw new UndefinedPropertyError(lookup.name);
  }
  const value = bag[lookup.name];
  if (value === undefined) {
    return def.defaultValue as T;
  }
  return value as T;
}
