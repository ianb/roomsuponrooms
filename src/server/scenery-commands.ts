import type { Entity } from "../core/entity.js";
import type { GameInstance } from "../games/registry.js";
import type { GamePrompts } from "../core/game-data.js";
import type { DebugInfo } from "../core/world.js";
import { getPlayerRoom } from "../core/world.js";
import {
  isSceneryWord,
  isExamineVerb,
  getStoredScenery,
  isItemSceneryWord,
  generateSceneryDescription,
} from "./ai-scenery.js";
import { getStorage } from "./storage-instance.js";
import type { AuthoringInfo } from "./storage.js";
import { recordAiCall } from "./ai-quota.js";

interface SceneryResponse {
  output: string;
  debug?: DebugInfo;
}

/** Identify where a scenery word comes from: room description, item description, or recent output */
function findScenerySource(
  game: GameInstance,
  { objectName, room, playerId }: { objectName: string; room: Entity; playerId: string },
):
  | { source: "room" }
  | { source: "item"; entityId: string }
  | { source: "output"; entityId?: string; outputText: string }
  | null {
  // 1. Room description
  if (isSceneryWord(objectName, room)) {
    return { source: "room" };
  }
  // 2. Also check stored scenery on the room (might match via alias)
  if (getStoredScenery(room, objectName)) {
    return { source: "room" };
  }
  // 3. Item descriptions
  const itemMatch = isItemSceneryWord(objectName, { store: game.store, roomId: room.id, playerId });
  if (itemMatch) {
    return { source: "item", entityId: itemMatch.entityId };
  }
  // 4. Recent command outputs
  if (game.recentOutputs) {
    const outputMatch = game.recentOutputs.findWord(objectName);
    if (outputMatch) {
      return {
        source: "output",
        entityId: outputMatch.sourceEntityId,
        outputText: outputMatch.output,
      };
    }
  }
  return null;
}

/** Check if an unresolved object is scenery and handle it */
export async function handleSceneryCheck(
  game: GameInstance,
  {
    verb,
    objectName,
    gameId,
    prompts,
    debug,
    authoring,
  }: {
    verb: string;
    objectName: string;
    gameId: string;
    prompts?: GamePrompts;
    debug?: boolean;
    authoring: AuthoringInfo;
  },
): Promise<SceneryResponse | null> {
  const room = getPlayerRoom(game.store);
  const players = game.store.findByTag("player");
  const playerId = players[0] ? players[0].id : "player:1";

  const scenerySource = findScenerySource(game, { objectName, room, playerId });
  if (!scenerySource) return null;

  // Non-examine verbs: return stored rejection or generic one
  if (!isExamineVerb(verb)) {
    // Check room scenery, then source entity scenery
    const stored = getStoredScenery(room, objectName);
    if (stored) {
      return { output: `{!${stored.rejection}!}` };
    }
    const sceneryEntityId2 =
      scenerySource.source === "item" || scenerySource.source === "output"
        ? scenerySource.entityId
        : undefined;
    if (sceneryEntityId2 && game.store.has(sceneryEntityId2)) {
      const entityStored = getStoredScenery(game.store.get(sceneryEntityId2), objectName);
      if (entityStored) {
        return { output: `{!${entityStored.rejection}!}` };
      }
    }
    return { output: `{!You can't do that with the ${objectName}.!}` };
  }

  // Determine the entity to store scenery on and pass as context
  const sceneryEntityId =
    scenerySource.source === "item" || scenerySource.source === "output"
      ? scenerySource.entityId
      : undefined;
  const sourceEntity =
    sceneryEntityId && game.store.has(sceneryEntityId)
      ? game.store.get(sceneryEntityId)
      : undefined;

  // Examine: generate or return stored description
  const result = await generateSceneryDescription(game.store, {
    word: objectName,
    room,
    sourceEntity,
    recentOutput: scenerySource.source === "output" ? scenerySource.outputText : undefined,
    prompts,
  });

  // Record AI usage if this was a new generation (not cached)
  if (result.debug) {
    await recordAiCall(authoring.createdBy, "scenery");
  }

  // Store on the source entity if it's item/output scenery, otherwise on room
  const storeOnEntity = sourceEntity || room;
  await getStorage().saveAiEntity({
    createdAt: new Date().toISOString(),
    gameId,
    id: storeOnEntity.id,
    tags: [...storeOnEntity.tags],
    name: storeOnEntity.name,
    description: storeOnEntity.description,
    location: storeOnEntity.location,
    aliases: storeOnEntity.aliases.length > 0 ? [...storeOnEntity.aliases] : undefined,
    secret: storeOnEntity.secret,
    scenery: storeOnEntity.scenery.length > 0 ? [...storeOnEntity.scenery] : undefined,
    exit: storeOnEntity.exit,
    room: storeOnEntity.room,
    ai: storeOnEntity.ai,
    properties:
      Object.keys(storeOnEntity.properties).length > 0
        ? { ...storeOnEntity.properties }
        : undefined,
    authoring,
  });

  const debugInfo: DebugInfo | undefined =
    debug && result.debug
      ? {
          parse: `${verb} "${objectName}" (scenery${scenerySource.source !== "room" ? `, ${scenerySource.source}` : ""})`,
          outcome: "scenery",
          aiFallback: result.debug,
        }
      : undefined;

  return { output: result.entry.description, debug: debugInfo };
}
