import type { EntityStore } from "./entity.js";
import type { VerbRegistry } from "./verbs.js";
import type { Track } from "./progression.js";
import { processCommand } from "./world.js";
import { describeRoomFull } from "./describe.js";
import { isRoomLit, darknessDescription } from "./darkness.js";

export interface GameRunner {
  /** Send a command and return the output */
  command(input: string): Promise<string>;
  /** Get the current room description */
  look(): string;
  /** Get the entity store for direct inspection */
  store: EntityStore;
  /** Get the verb registry */
  verbs: VerbRegistry;
  /** Run multiple commands, returning all outputs */
  run(commands: string[]): Promise<string[]>;
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
  tracks,
}: {
  store: EntityStore;
  verbs: VerbRegistry;
  tracks?: Track[];
}): GameRunner {
  function getPlayer(): { id: string; location: string } {
    const players = store.findByTag("player");
    const player = players[0];
    if (!player) throw new PlayerNotFoundError();
    return { id: player.id, location: player.location };
  }

  function look(): string {
    const player = getPlayer();
    const room = store.get(player.location);
    if (!isRoomLit(store, { room, playerId: player.id })) {
      return darknessDescription();
    }
    return describeRoomFull(store, { room, playerId: player.id });
  }

  async function command(input: string): Promise<string> {
    const result = await processCommand(store, { input, verbs, tracks });
    return result.output;
  }

  async function run(commands: string[]): Promise<string[]> {
    const outputs: string[] = [];
    for (const cmd of commands) outputs.push(await command(cmd));
    return outputs;
  }

  function getProperty(entityId: string, property: string): unknown {
    return store.getProperty(entityId, property);
  }

  function currentRoom(): string {
    return getPlayer().location;
  }

  return { command, look, store, verbs, run, getProperty, currentRoom };
}
