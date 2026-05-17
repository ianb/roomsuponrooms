import type { EntityStore } from "../core/entity.js";
import { getStoredScenery, isExamineVerb, isSceneryWord, isItemSceneryWord } from "./ai-scenery.js";
import type { PlaytestStep } from "./agent-tool-playtest.js";

/**
 * processCommand only consults the entity registry, so an examine of a stored
 * scenery word comes back as unresolved in playtest even though it would
 * resolve in real play (via executeCommand's trySceneryFallback). This module
 * fills that gap for the playtest tool: stored scenery is surfaced as a
 * performed/vetoed step, and unresolved cases get a diagnostic listing the
 * room's scenery so the agent can see what *would* match.
 */
export function trySceneryResolve(
  store: EntityStore,
  { command, unresolved }: { command: string; unresolved: { verb: string; objectName: string } },
): PlaytestStep | null {
  const players = store.findByTag("player");
  const player = players[0];
  if (!player) return null;
  const roomId = player.location;
  if (!store.has(roomId)) return null;
  const room = store.get(roomId);

  const roomEntry = getStoredScenery(room, unresolved.objectName);
  if (roomEntry) {
    return sceneryStep({ command, unresolved, entry: roomEntry, sourceId: room.id });
  }

  // Stored scenery on any visible item (room contents or player inventory).
  const candidates = [...store.getContents(roomId), ...store.getContents(player.id)];
  for (const entity of candidates) {
    if (entity.tags.includes("exit") || entity.tags.includes("player")) continue;
    const entry = getStoredScenery(entity, unresolved.objectName);
    if (entry) {
      return sceneryStep({ command, unresolved, entry, sourceId: entity.id });
    }
  }
  return null;
}

function sceneryStep({
  command,
  unresolved,
  entry,
  sourceId,
}: {
  command: string;
  unresolved: { verb: string; objectName: string };
  entry: { word: string; aliases?: string[]; description: string; rejection: string };
  sourceId: string;
}): PlaytestStep {
  const examining = isExamineVerb(unresolved.verb);
  const output = examining ? entry.description : `{!${entry.rejection}!}`;
  return {
    command,
    outcome: examining ? "performed" : "vetoed",
    output,
    events: [],
    parse: `${unresolved.verb} "${unresolved.objectName}" → scenery "${entry.word}" on ${sourceId}`,
    handler: "[scenery]",
  };
}

export function describeSceneryGap(store: EntityStore, objectName: string): string | null {
  const players = store.findByTag("player");
  const player = players[0];
  if (!player) return null;
  const roomId = player.location;
  if (!store.has(roomId)) return null;
  const room = store.get(roomId);

  const lines: string[] = [];
  if (room.scenery.length > 0) {
    lines.push(`Stored scenery on ${room.id}: ${summarizeScenery(room.scenery)}`);
  } else {
    lines.push(`No stored scenery on ${room.id}.`);
  }
  const items = [...store.getContents(roomId), ...store.getContents(player.id)].filter(
    (e) => !e.tags.includes("exit") && !e.tags.includes("player") && e.scenery.length > 0,
  );
  for (const item of items) {
    lines.push(`Stored scenery on ${item.id}: ${summarizeScenery(item.scenery)}`);
  }
  // Flag description-derived scenery: would resolve via AI fallback in real
  // play but not here.
  if (isSceneryWord(objectName, room)) {
    lines.push(
      `"${objectName}" appears in ${room.id}'s description and would be AI-generated as scenery in real play — but AI fallback is disabled in playtest. Add it as a stored scenery word/alias if you want a deterministic description.`,
    );
  } else {
    const itemMatch = isItemSceneryWord(objectName, { store, roomId, playerId: player.id });
    if (itemMatch) {
      lines.push(
        `"${objectName}" appears in ${itemMatch.entityId}'s description and would be AI-generated as scenery in real play — but AI fallback is disabled in playtest. Add it as a stored scenery word/alias if you want a deterministic description.`,
      );
    }
  }
  lines.push(
    "Scenery is matched by EXACT word or alias (case-insensitive). The player's input must match one of the strings above verbatim.",
  );
  return `{!Scenery diagnostic:\n${lines.map((l) => `  - ${l}`).join("\n")}!}`;
}

function summarizeScenery(scenery: Array<{ word: string; aliases?: string[] }>): string {
  return scenery
    .map((s) => {
      const aliases =
        s.aliases && s.aliases.length > 0 ? ` (aliases: ${s.aliases.join(", ")})` : "";
      return `"${s.word}"${aliases}`;
    })
    .join(", ");
}
