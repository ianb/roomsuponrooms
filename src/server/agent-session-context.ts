import type { Entity, EntityStore } from "../core/entity.js";
import type { EventLogEntry, RuntimeStorage } from "./storage.js";

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

  sections.push(renderWorldMap(store));

  const currentRoom = renderCurrentRoom(store);
  if (currentRoom) sections.push(currentRoom);

  const events = await storage.loadEvents({ gameId, userId });
  const recent = renderRecentEvents(events);
  if (recent) sections.push(recent);

  sections.push(`<request>\n${request}\n</request>`);

  return sections.join("\n\n");
}

const WORLD_MAP_ROOM_CAP = 60;

/**
 * A compact overview of the whole world: every room with its exit graph,
 * every NPC with its location, and a census of the remaining entities by
 * tag. This is the agent's grounding — the request usually concerns rooms
 * far from the player, and without a map agents either guess at ids or
 * burn turns on broad discovery queries.
 */
function renderWorldMap(store: EntityStore): string {
  const lines: string[] = [];
  const rooms = store.findByTag("room");
  lines.push(`Rooms (${rooms.length}):`);
  for (const room of rooms.slice(0, WORLD_MAP_ROOM_CAP)) {
    const exits = store
      .getExits(room.id)
      .map((e) => {
        const dir = (e.exit && e.exit.direction) || "?";
        const dest = (e.exit && e.exit.destination) || "(unresolved)";
        const locked = e.properties.locked ? " [locked]" : "";
        return `${dir}→"${dest}"${locked}`;
      })
      .join(", ");
    lines.push(`  "${room.id}" (${room.name})${exits ? ` — ${exits}` : " — no exits"}`);
  }
  if (rooms.length > WORLD_MAP_ROOM_CAP) {
    lines.push(`  …and ${rooms.length - WORLD_MAP_ROOM_CAP} more (query kind:"get" id:"room:*")`);
  }

  const npcs = store.findByTag("npc");
  if (npcs.length > 0) {
    lines.push(`NPCs (${npcs.length}):`);
    for (const npc of npcs) {
      lines.push(`  "${npc.id}" (${npc.name}) in "${npc.location}"`);
    }
  }

  const tagCounts = new Map<string, number>();
  for (const id of store.getAllIds()) {
    const e = store.get(id);
    if (e.tags.includes("room") || e.tags.includes("npc") || e.tags.includes("exit")) continue;
    const tag = e.tags[0] || "(untagged)";
    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }
  if (tagCounts.size > 0) {
    const census = [...tagCounts.entries()]
      .toSorted((a, b) => b[1] - a[1])
      .map(([tag, n]) => `${tag}: ${n}`)
      .join(", ");
    lines.push(`Other entities by first tag: ${census}`);
  }

  return `<world-map>\n${lines.join("\n")}\n</world-map>`;
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
  const room = store.get(player.location);
  const lines: string[] = [];
  // Header: id, name, parent location. Tags only when interesting (every room
  // has "room"; mention extras like "dark", etc.).
  const extraTags = room.tags.filter((t) => t !== "room");
  const tagSuffix = extraTags.length > 0 ? ` [tags: ${extraTags.join(", ")}]` : "";
  lines.push(`Room "${room.id}" (${room.name})${tagSuffix}`);
  if (room.location) lines.push(`Inside: "${room.location}"`);
  lines.push(...renderHiddenFieldNotes(room));

  // Children: one terse line each. Sorted so exits come first (they're the
  // most actionable for navigation), then NPCs, then everything else.
  const children = store.getContents(room.id).filter((c) => c.id !== player.id);
  if (children.length > 0) {
    const sorted = children.toSorted(compareForRoom);
    lines.push("");
    lines.push(`Children (${children.length}):`);
    for (const child of sorted) lines.push("  - " + summarizeChild(child, store));
  }

  // Neighbors: just id + name + via direction. No nested children.
  const neighbors = collectNeighbors(store, room);
  if (neighbors.length > 0) {
    lines.push("");
    lines.push(`Neighbors (${neighbors.length}):`);
    for (const n of neighbors) {
      lines.push(
        `  - ${n.via.direction || "?"} via "${n.via.id}" → "${n.room.id}" (${n.room.name})`,
      );
    }
  }

  lines.push("");
  lines.push(
    "Not shown above: full descriptions, secrets, scenery details, ai prompts, neighbor room contents.",
  );
  lines.push('To see everything on one entity:  query({kind:"get", id:"item:stuck-turnstile"})');
  lines.push(
    'To see a room with its children + reachable rooms:  query({kind:"get", id:"' +
      room.id +
      '", withChildren:true, withNeighborhood:true})',
  );
  lines.push(
    'To list every entity tagged X:  query({kind:"entities", jq:"[.[] | select(.tags | index(\\"X\\"))]"})',
  );

  return `<current-room>\n${lines.join("\n")}\n</current-room>`;
}

/**
 * Build a one-line summary of an entity for the children listing. Includes
 * id, name, key tags, aliases (when set), and short data-presence indicators
 * for descriptions, secrets, scenery, and properties so the agent can see
 * what's there to query without dumping it all.
 */
function summarizeChild(entity: Entity, store: EntityStore): string {
  const parts: string[] = [`"${entity.id}" (${entity.name})`];
  if (entity.tags.length > 0) parts.push(`[${entity.tags.join(", ")}]`);
  if (entity.aliases && entity.aliases.length > 0) {
    parts.push(`aliases: [${entity.aliases.join(", ")}]`);
  }
  // Exit-specific: direction → destination.
  if (entity.exit) {
    const dest = entity.exit.destination;
    const destName = dest && store.has(dest) ? store.get(dest).name : null;
    const destStr = dest ? `"${dest}"${destName ? ` (${destName})` : ""}` : "(no destination)";
    parts.push(`${entity.exit.direction} → ${destStr}`);
  }
  // Property summary: drop a few key state flags inline rather than a count.
  const propKeys = entity.properties ? Object.keys(entity.properties) : [];
  const stateFlags = propKeys
    .filter((k) => typeof entity.properties[k] === "boolean")
    .map((k) => `${k}=${entity.properties[k]}`);
  if (stateFlags.length > 0) parts.push(stateFlags.join(", "));
  // Indicators for richer data the agent might want to query.
  const has: string[] = [];
  if (entity.description && entity.description.length > 0) has.push("description");
  if (entity.secret && entity.secret.length > 0) has.push("secret");
  if (entity.scenery && entity.scenery.length > 0) has.push(`scenery(${entity.scenery.length})`);
  if (entity.ai) has.push("ai");
  if (propKeys.length > stateFlags.length) {
    has.push(`${propKeys.length - stateFlags.length} other props`);
  }
  if (has.length > 0) parts.push(`has: ${has.join(", ")}`);
  return parts.join(" · ");
}

function renderHiddenFieldNotes(room: Entity): string[] {
  const notes: string[] = [];
  if (room.description && room.description.length > 0) {
    notes.push(`Description: (${room.description.length} chars; query for full text)`);
  }
  if (room.secret && room.secret.length > 0) {
    notes.push("Secret: present (designer-only hint; query for full text)");
  }
  return notes;
}

interface NeighborSummary {
  via: { id: string; direction: string };
  room: { id: string; name: string };
}

function collectNeighbors(store: EntityStore, room: Entity): NeighborSummary[] {
  const out: NeighborSummary[] = [];
  for (const child of store.getContents(room.id)) {
    if (!child.tags.includes("exit")) continue;
    const dest = child.exit && child.exit.destination;
    if (!dest || !store.has(dest)) continue;
    const destRoom = store.get(dest);
    out.push({
      via: { id: child.id, direction: (child.exit && child.exit.direction) || "" },
      room: { id: destRoom.id, name: destRoom.name },
    });
  }
  return out;
}

function compareForRoom(a: Entity, b: Entity): number {
  return rankForRoom(a) - rankForRoom(b);
}

function rankForRoom(e: Entity): number {
  if (e.tags.includes("exit")) return 0;
  if (e.tags.includes("npc")) return 1;
  if (e.tags.includes("portable")) return 2;
  return 3;
}

function renderRecentEvents(entries: EventLogEntry[]): string | null {
  if (entries.length === 0) return null;
  const slice = entries.slice(-RECENT_EVENTS_LIMIT);
  const blocks = slice.map((entry, i) => {
    const offset = slice.length - i - 1;
    const label = offset === 0 ? "just now" : `${offset} turn${offset === 1 ? "" : "s"} ago`;
    const descs = entry.events
      .map((e) => e.description)
      .filter((d) => d && d.length > 0)
      .join(", ");
    const headerLine = `[${label}] ${entry.command}${descs ? " — " + descs : ""}`;
    const output = entry.output ? entry.output.trim() : "";
    if (!output) return headerLine;
    // Indent the response so it's clearly the output, not nested data.
    const indented = output
      .split("\n")
      .map((line) => "  " + line)
      .join("\n");
    return `${headerLine}\n${indented}`;
  });
  return `<recent-events>\n${blocks.join("\n\n")}\n</recent-events>`;
}
