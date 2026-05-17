import type { EntityStore } from "../core/index.js";
import { describeRoomFull } from "../core/index.js";
import { HELP_TEXT } from "../core/handler-lib-docs.js";
import type { GameInstance } from "../games/registry.js";
import { getStorage } from "./storage-instance.js";
import type { AuthoringInfo, SessionKey } from "./storage.js";
import { isRoomLit, darknessDescription } from "../core/darkness.js";
import {
  handleAiCreateExitCommand,
  handleAiCreateCommand,
  handleAiDestroyCommand,
  handleAiDestroyVerbCommand,
  handleAiAgentCommand,
} from "./ai-commands.js";

interface CommandOpts {
  gameId: string;
  prompts?: GameInstance["prompts"];
  debug?: boolean;
  hasAiRole?: boolean;
  authoring: AuthoringInfo;
}

type CommandReturn =
  | { output: string; debug?: unknown }
  | Promise<{ output: string; debug?: unknown }>;

function describeCurrentRoom(s: EntityStore): string {
  const players = s.findByTag("player");
  const player = players[0];
  if (!player) return "No player found.";
  const roomId = player.location;
  const room = s.get(roomId);
  if (!isRoomLit(s, { room, playerId: player.id })) {
    return darknessDescription();
  }
  return describeRoomFull(s, { room, playerId: player.id });
}

export function handleSpecialCommand(
  trimmed: string,
  {
    game,
    session,
    opts,
    reinitGame,
    onAgentProgress,
  }: {
    game: GameInstance;
    session: SessionKey;
    opts: CommandOpts;
    reinitGame?: (session: SessionKey) => Promise<GameInstance>;
    onAgentProgress?: (progress: {
      turn: number;
      toolCalls: Array<{ name: string; summary: string }>;
    }) => void;
  },
): CommandReturn | null {
  if (trimmed === "/undo" && reinitGame) {
    const doUndo = async () => {
      const popped = await getStorage().popEvent(session);
      if (!popped) return { output: "Nothing to undo.", debug: undefined };
      const rebuilt = await reinitGame(session);
      return { output: "[Undone]\n\n" + describeCurrentRoom(rebuilt.store), debug: undefined };
    };
    return doUndo();
  }

  // `help` is intercepted here (not dispatched through the verb registry) so
  // it works even when the player's current room is missing — at which point
  // processCommand's getPlayerRoom would throw before reaching any verb.
  if (trimmed === "help") {
    return { output: HELP_TEXT, debug: undefined };
  }

  if ((trimmed === "/reset" || trimmed === "reset" || trimmed === "restart") && reinitGame) {
    const doReset = async () => {
      await getStorage().clearEvents(session);
      const rebuilt = await reinitGame(session);
      return { output: "[Reset]\n\n" + describeCurrentRoom(rebuilt.store), debug: undefined };
    };
    return doReset();
  }

  if (trimmed === "help ai") {
    return {
      output: [
        "AI & World-Editing Commands:",
        "  ai create <description>      — Create an object in the current room",
        "  ai create exit <description> — Create a new exit from the current room",
        "  ai destroy <object>          — Remove an AI-created object",
        "  ai destroy verb <search>     — Find and remove an AI-created verb handler",
        "  ai agent <instructions>      — Run an autonomous agent to make coordinated changes",
        "",
        "System:",
        "  /undo  — Undo the last action",
        "  /reset — Reset the game to its initial state",
      ].join("\n"),
      debug: undefined,
    };
  }

  if (trimmed.startsWith("ai ") && !opts.hasAiRole) {
    return { output: "You don't have permission to use AI commands.", debug: undefined };
  }

  if (trimmed.startsWith("ai agent ")) {
    const instructions = trimmed.slice("ai agent ".length).trim();
    if (!instructions) return { output: "Usage: ai agent <instructions>", debug: undefined };
    const a = { ...opts.authoring, creationSource: "agent" };
    return handleAiAgentCommand({
      instructions,
      gameId: opts.gameId,
      userId: opts.authoring.createdBy,
      authoring: a,
      onProgress: onAgentProgress,
    });
  }

  if (trimmed.startsWith("ai create exit ")) {
    const instructions = trimmed.slice("ai create exit ".length).trim();
    if (!instructions) return { output: "Usage: ai create exit <description>", debug: undefined };
    const a = { ...opts.authoring, creationSource: "ai-create-exit" };
    return handleAiCreateExitCommand(game.store, { instructions, ...opts, authoring: a });
  }

  if (trimmed.startsWith("ai create ")) {
    const description = trimmed.slice("ai create ".length).trim();
    if (!description) return { output: "Usage: ai create <description>", debug: undefined };
    const a = { ...opts.authoring, creationSource: "ai-create" };
    return handleAiCreateCommand(game.store, { description, ...opts, authoring: a });
  }

  if (trimmed.startsWith("ai destroy verb confirm ")) {
    const name = trimmed.slice("ai destroy verb confirm ".length).trim();
    if (!name) return { output: "Usage: ai destroy verb confirm <name>", debug: undefined };
    return handleAiDestroyVerbCommand({
      search: name,
      confirm: true,
      gameId: session.gameId,
      verbs: game.verbs,
    });
  }

  if (trimmed.startsWith("ai destroy verb ")) {
    const search = trimmed.slice("ai destroy verb ".length).trim();
    if (!search) return { output: "Usage: ai destroy verb <search>", debug: undefined };
    return handleAiDestroyVerbCommand({
      search,
      confirm: false,
      gameId: session.gameId,
      verbs: game.verbs,
    });
  }

  if (trimmed.startsWith("ai destroy ")) {
    const objectName = trimmed.slice("ai destroy ".length).trim().toLowerCase();
    if (!objectName) return { output: "Usage: ai destroy <object>", debug: undefined };
    return handleAiDestroyCommand(game.store, { objectName, gameId: session.gameId });
  }

  return null;
}
