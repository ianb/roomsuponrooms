import type { Entity } from "./entity.js";
import type { ResolvedCommand, EntityRequirements } from "./verb-types.js";
import { resolvePrep } from "./command-parser.js";

/**
 * Shared command-shape helpers used by verb dispatch (verbs.ts) and
 * mismatch diagnostics (verb-diagnostics.ts), so the two can't drift apart.
 */

export function getCommandPrep(command: ResolvedCommand): string | null {
  if (command.form === "ditransitive") return command.prep;
  if (command.form === "prepositional") return command.prep;
  return null;
}

/**
 * Does a handler's prep accept the command's prep? Matches exactly, or when
 * both resolve to the same PREP_GROUP — so a handler written with "into"
 * accepts "put X in Y" and vice versa, and a handler may use the group name
 * ("containment") directly.
 */
export function prepMatches(patternPrep: string, commandPrep: string): boolean {
  if (patternPrep === commandPrep) return true;
  return resolvePrep(patternPrep) === resolvePrep(commandPrep);
}

export function getDirectObject(command: ResolvedCommand): Entity | null {
  if (command.form === "transitive" || command.form === "prepositional") return command.object;
  if (command.form === "ditransitive") return command.object;
  return null;
}

export function getIndirectObject(command: ResolvedCommand): Entity | null {
  if (command.form === "ditransitive") return command.indirect;
  return null;
}

export function involvesEntity(command: ResolvedCommand, entityId: string): boolean {
  if (command.form === "transitive" || command.form === "prepositional") {
    return command.object.id === entityId;
  }
  if (command.form === "ditransitive") {
    return command.object.id === entityId || command.indirect.id === entityId;
  }
  return false;
}

export function involvesTag(command: ResolvedCommand, tag: string): boolean {
  if (command.form === "transitive" || command.form === "prepositional") {
    return command.object.tags.includes(tag);
  }
  if (command.form === "ditransitive") {
    return command.object.tags.includes(tag) || command.indirect.tags.includes(tag);
  }
  return false;
}

export function meetsRequirements(entity: Entity, reqs: EntityRequirements): boolean {
  if (reqs.tags) {
    for (const tag of reqs.tags) {
      if (!entity.tags.includes(tag)) return false;
    }
  }
  if (reqs.properties) {
    for (const [key, expected] of Object.entries(reqs.properties)) {
      if (entity.properties[key] !== expected) return false;
    }
  }
  return true;
}
