import type { Entity } from "./entity.js";
import type { ResolvedCommand } from "./verb-types.js";
import type { parseCommand } from "./verbs.js";

export function entityLabel(entity: Entity): string {
  const name = (entity.properties["name"] as string) || entity.id;
  return `${name} [${entity.id}]`;
}

export function describeParsed(parsed: ReturnType<typeof parseCommand>): string {
  if (!parsed) return "?";
  if (parsed.form === "intransitive") return parsed.verb;
  if (parsed.form === "transitive") return `${parsed.verb} "${parsed.object}"`;
  if (parsed.form === "prepositional") return `${parsed.verb} ${parsed.prep} "${parsed.object}"`;
  return `${parsed.verb} "${parsed.object}" ${parsed.prep} "${parsed.indirect}"`;
}

export function describeResolved(resolved: ResolvedCommand): string {
  if (resolved.form === "intransitive") return resolved.verb;
  if (resolved.form === "transitive") return `${resolved.verb} ${entityLabel(resolved.object)}`;
  if (resolved.form === "prepositional") {
    return `${resolved.verb} ${resolved.prep} ${entityLabel(resolved.object)}`;
  }
  return `${resolved.verb} ${entityLabel(resolved.object)} ${resolved.prep} ${entityLabel(resolved.indirect)}`;
}
