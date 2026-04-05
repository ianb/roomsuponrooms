import type { PropertyRegistry } from "./properties.js";
import { validateValue } from "./properties.js";
import type { CreateEntityOptions } from "./entity-types.js";
import { UndefinedPropertyError, PropertyValueError } from "./entity-errors.js";

export interface SplitResult {
  typed: {
    name: string | undefined;
    description: string | undefined;
    location: string | undefined;
    aliases: string[] | undefined;
    secret: string | undefined;
  };
  props: Record<string, unknown>;
  exit?: { direction: string; destination?: string; destinationIntent?: string };
  grid?: { x: number; y: number; z: number };
}

const SKIP_KEYS = new Set([
  "name",
  "description",
  "location",
  "aliases",
  "secret",
  "direction",
  "destination",
  "destinationIntent",
  "gridX",
  "gridY",
  "gridZ",
]);

export function splitProperties(
  opts: CreateEntityOptions,
  registry: PropertyRegistry,
): SplitResult {
  const raw = opts.properties || {};
  const typed = {
    name: (raw["name"] as string) || opts.name,
    description: (raw["description"] as string) || opts.description,
    location: (raw["location"] as string) || opts.location,
    aliases: (raw["aliases"] as string[]) || opts.aliases,
    secret: (raw["secret"] as string) || opts.secret,
  };
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === null || v === undefined || SKIP_KEYS.has(k)) continue;
    const def = registry.definitions[k];
    if (!def) throw new UndefinedPropertyError(k);
    const errors = validateValue(registry, { name: k, value: v });
    if (errors.length > 0) throw new PropertyValueError(k, errors);
    props[k] = v;
  }
  let exit = opts.exit;
  if (!exit && raw["direction"]) {
    exit = {
      direction: raw["direction"] as string,
      destination: raw["destination"] as string | undefined,
      destinationIntent: raw["destinationIntent"] as string | undefined,
    };
  }
  let grid: { x: number; y: number; z: number } | undefined;
  if (raw["gridX"] !== undefined) {
    grid = { x: raw["gridX"] as number, y: raw["gridY"] as number, z: raw["gridZ"] as number };
  }
  return { typed, props, exit, grid };
}
