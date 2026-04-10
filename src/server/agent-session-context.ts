import type { EntityStore } from "../core/entity.js";
import type { EventLogEntry, RuntimeStorage } from "./storage.js";
import { buildGetView } from "./agent-query-views.js";

const RECENT_EVENTS_LIMIT = 5;

/**
 * Build the initial user-message text for an agent session. Includes:
 *   - the player's current room (full getRoom view: nested exits + shallow contents)
 *   - the player's identity and location ids (quoted for clarity)
 *   - the most recent 5 events from the per-user event log
 *   - the player's request
 *
 * Lives in the user message (not the system prompt) because all of this is
 * per-session and changes between runs. The system prompt stays cacheable.
 */
export async function buildSessionContextMessage(
  store: EntityStore,
  {
    storage,
    gameId,
    userId,
    request,
  }: {
    storage: RuntimeStorage;
    gameId: string;
    userId: string;
    request: string;
  },
): Promise<string> {
  const sections: string[] = [];

  const playerSection = renderPlayerContext(store);
  if (playerSection) sections.push(playerSection);

  const currentRoom = renderCurrentRoom(store);
  if (currentRoom) sections.push(currentRoom);

  const events = await storage.loadEvents({ gameId, userId });
  const recent = renderRecentEvents(events);
  if (recent) sections.push(recent);

  sections.push(`<request>\n${request}\n</request>`);

  return sections.join("\n\n");
}

function renderPlayerContext(store: EntityStore): string | null {
  const players = store.findByTag("player");
  const player = players[0];
  if (!player) return null;
  const room = store.has(player.location) ? store.get(player.location) : null;
  if (!room) {
    return `<player-context>\nPlayer "${player.id}" is at "${player.location}" (unknown room).\n</player-context>`;
  }
  return `<player-context>\nPlayer "${player.id}" is in "${room.id}" ("${room.name}").\n</player-context>`;
}

function renderCurrentRoom(store: EntityStore): string | null {
  const players = store.findByTag("player");
  const player = players[0];
  if (!player) return null;
  if (!store.has(player.location)) return null;
  const view = buildGetView(store, {
    id: player.location,
    withChildren: true,
    withNeighborhood: true,
    depth: 1,
  });
  if (!view) return null;
  return `<current-room>\n${JSON.stringify(view, null, 2)}\n</current-room>`;
}

function renderRecentEvents(entries: EventLogEntry[]): string | null {
  if (entries.length === 0) return null;
  const slice = entries.slice(-RECENT_EVENTS_LIMIT);
  const lines = slice.map((entry, i) => {
    const offset = slice.length - i - 1;
    const label = offset === 0 ? "just now" : `${offset} turn${offset === 1 ? "" : "s"} ago`;
    const descs = entry.events
      .map((e) => e.description)
      .filter((d) => d && d.length > 0)
      .join(", ");
    return `[${label}] ${entry.command}${descs ? " — " + descs : ""}`;
  });
  return `<recent-events>\n${lines.join("\n")}\n</recent-events>`;
}
