import type { EntityStore } from "./entity.js";
import type { VerbRegistry } from "./verbs.js";
import { processCommand } from "./world.js";
import { describeRoomFull } from "./describe.js";

export interface GameRunner {
  /** Send a command and return the output */
  command(input: string): string;
  /** Get the current room description */
  look(): string;
  /** Get the entity store for direct inspection */
  store: EntityStore;
  /** Get the verb registry */
  verbs: VerbRegistry;
  /** Run multiple commands, returning all outputs */
  run(commands: string[]): string[];
  /** Get a property of an entity */
  getProperty(entityId: string, property: string): unknown;
  /** Get the player's current room ID */
  currentRoom(): string;
}

class PlayerNotFoundError extends Error {
  constructor() {
    super("No player entity found");
    this.name = "PlayerNotFoundError";
  }
}

export function createGameRunner({
  store,
  verbs,
}: {
  store: EntityStore;
  verbs: VerbRegistry;
}): GameRunner {
  function getPlayer(): { id: string; location: string } {
    const players = store.findByTag("player");
    const player = players[0];
    if (!player) throw new PlayerNotFoundError();
    return { id: player.id, location: player.properties["location"] as string };
  }

  function look(): string {
    const player = getPlayer();
    const room = store.get(player.location);
    return describeRoomFull(store, { room, playerId: player.id });
  }

  function command(input: string): string {
    const result = processCommand(store, { input, verbs });
    return result.output;
  }

  function run(commands: string[]): string[] {
    return commands.map((cmd) => command(cmd));
  }

  function getProperty(entityId: string, property: string): unknown {
    return store.getProperty(entityId, property);
  }

  function currentRoom(): string {
    return getPlayer().location;
  }

  return { command, look, store, verbs, run, getProperty, currentRoom };
}
