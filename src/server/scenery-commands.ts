import type { GameInstance } from "../games/registry.js";
import type { GamePrompts } from "../core/game-data.js";
import type { DebugInfo } from "../core/world.js";
import { getPlayerRoom } from "../core/world.js";
import {
  isSceneryWord,
  isExamineVerb,
  getCachedScenery,
  generateSceneryDescription,
} from "./ai-scenery.js";
import { appendEventLog } from "./event-log.js";

interface SceneryResponse {
  output: string;
  debug?: DebugInfo;
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
  }: {
    verb: string;
    objectName: string;
    gameId: string;
    prompts?: GamePrompts;
    debug?: boolean;
  },
): Promise<SceneryResponse | null> {
  const room = getPlayerRoom(game.store);

  if (!isSceneryWord(objectName, room)) {
    return null;
  }

  // Non-examine verbs: return cached rejection or generic one
  if (!isExamineVerb(verb)) {
    const cached = getCachedScenery(room, objectName);
    if (cached) {
      return { output: cached.rejection };
    }
    return { output: `You can't do that with the ${objectName}.` };
  }

  // Examine: generate or return cached description
  const result = await generateSceneryDescription(game.store, {
    word: objectName,
    room,
    prompts,
  });

  // Persist the scenery cache as an event
  appendEventLog(gameId, {
    command: `examine ${objectName}`,
    events: [
      {
        type: "set-property",
        entityId: room.id,
        property: "scenery",
        value: room.properties["scenery"],
        description: `Cached scenery: ${objectName}`,
      },
    ],
    timestamp: new Date().toISOString(),
  });

  const debugInfo: DebugInfo | undefined =
    debug && result.debug
      ? {
          parse: `${verb} "${objectName}" (scenery)`,
          outcome: "scenery",
          aiFallback: result.debug,
        }
      : undefined;

  return { output: result.entry.description, debug: debugInfo };
}
