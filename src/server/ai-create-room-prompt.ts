import type { EntityStore, Entity } from "../core/entity.js";
import type { GamePrompts } from "../core/game-data.js";
import { resolveRoomTexture } from "../core/room-texture.js";
import {
  describeProperties,
  collectTags,
  reverseDirection,
  buildNearbyContext,
  computeRoomCoordinates,
  buildAdjacentRoomContext,
} from "./ai-prompt-helpers.js";
import { composeCreatePrompt } from "./ai-prompts.js";

/**
 * Prompt construction for AI room materialization (unresolved exits). Split
 * from ai-create-room.ts for file-size reasons; the pacing/variety criteria
 * live here.
 */

function describeExitForLlm(entity: Entity): string {
  const dir = (entity.exit && entity.exit.direction) || "?";
  const dest = (entity.exit && entity.exit.destination) || "(unresolved)";
  const name = entity.name;
  return `- ${dir}: ${name} \u2192 ${dest}`;
}

export function buildPrompt(
  store: EntityStore,
  { exit, sourceRoom, playerId }: { exit: Entity; sourceRoom: Entity; playerId: string },
): string {
  const parts: string[] = [];
  const intent = (exit.exit && exit.exit.destinationIntent) || "unknown destination";
  const direction = (exit.exit && exit.exit.direction) || "unknown";
  const exitName = exit.name;
  parts.push(
    `<exit-context>\nThe player is going ${direction} through "${exitName}".\nDestination intent: ${intent}\nReturn direction: ${reverseDirection(direction)}\nSource room: ${sourceRoom.name}\n</exit-context>`,
  );
  parts.push(
    `<source-room>\n- ${sourceRoom.name}: ${sourceRoom.description || "No description."}\n</source-room>`,
  );
  const sourceExits = store.getContents(sourceRoom.id).filter((e) => e.tags.includes("exit"));
  if (sourceExits.length > 0) {
    parts.push(
      `<source-room-exits>\n${sourceExits.map(describeExitForLlm).join("\n")}\n</source-room-exits>`,
    );
  }
  const nearby = buildNearbyContext(store, { room: sourceRoom, playerId });
  if (nearby) parts.push(nearby);
  parts.push(buildAreaPacingContext(store, sourceRoom));
  // Adjacent rooms for grid connectivity
  const newCoords = computeRoomCoordinates(sourceRoom, direction);
  if (newCoords) {
    const adjacent = buildAdjacentRoomContext(store, newCoords);
    if (adjacent) parts.push(adjacent);
  }
  parts.push(`<available-properties>\n${describeProperties(store)}\n</available-properties>`);
  parts.push(`<existing-tags>\n${collectTags(store).join(", ")}\n</existing-tags>`);
  return parts.join("\n\n");
}

/**
 * Texture census of the rooms within two hops of the source: the raw
 * material for the model's pacing reasoning. Includes a saturation hint so
 * the variety criterion has teeth — after a run of rich rooms the right
 * answer is usually a boring one.
 */
function buildAreaPacingContext(store: EntityStore, sourceRoom: Entity): string {
  const seen = new Set<string>([sourceRoom.id]);
  let frontier = [sourceRoom.id];
  const lines: string[] = [];
  const counts = { sparse: 0, plain: 0, rich: 0 };
  for (let hop = 0; hop < 2; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const exit of store.getExits(id)) {
        const dest = exit.exit && exit.exit.destination;
        if (!dest || seen.has(dest) || !store.has(dest)) continue;
        seen.add(dest);
        next.push(dest);
      }
    }
    frontier = next;
  }
  for (const id of seen) {
    const texture = resolveRoomTexture(store, id);
    counts[texture] += 1;
    lines.push(`- ${store.get(id).name} (${id}): ${texture}`);
  }
  const total = counts.sparse + counts.plain + counts.rich;
  let hint: string;
  if (counts.rich / Math.max(1, total) >= 0.3) {
    hint =
      "This area is already saturated with rich rooms — strongly prefer a sparse or plain room here. A quiet stretch will make the busy ones land harder.";
  } else if (counts.sparse / Math.max(1, total) >= 0.7) {
    hint =
      "This area is mostly quiet — a plain or (if the intent justifies it) rich room could provide a welcome change of register.";
  } else {
    hint =
      "The area has a reasonable mix — choose the texture the exit intent and variety suggest, defaulting to the quieter option.";
  }
  return `<area-pacing>\nTextures of rooms within two hops (sparse = connective tissue, rich = destination):\n${lines.join("\n")}\nPacing hint: ${hint}\n</area-pacing>`;
}

export function buildSystemPrompt(ctx: {
  prompts?: GamePrompts;
  room: Entity;
  store: EntityStore;
}): string {
  const styleSection = composeCreatePrompt(ctx);
  return `<role>
You are creating a new room for a text adventure. The player walked through an exit to an unmaterialized destination. Create the room, contents, and any additional exits.
</role>

${styleSection}

<guidelines>
- The room must match the exit's destinationIntent — that's the primary constraint.
- PACING: not every room is a destination. Corridors, service passages, dull stretches, and quiet in-between spaces are GOOD — they are what make the rich rooms land. Use your reasoning field to decide, against <area-pacing>, whether this room should be sparse, plain, or rich, and commit to it.
- Match the description to the texture you chose. Sparse: 1-2 plain sentences; do NOT advertise interactive detail or intrigue. Plain: 2-3 sentences, modest. Rich: 2-4 vivid sentences that suggest actions — things that can be opened, examined, operated.
- Only promise what exists: if the description presents vendors, machines, or furniture as salient, either create them in contents or leave them as background texture consistent with the room's texture level.
- VARIETY: contrast with the neighbors in <area-pacing> — shift the sensory palette (sound, light, smell), scale, or mood rather than repeating the previous room's register.
- A return exit is created automatically — do NOT include it in additionalExits. Set returnExitName and returnExitDescription to give it a fitting name (e.g. "Worn Stone Steps" / "The steps lead back down to the hall.").
- Add 0-2 additional exits. Contents: sparse rooms get 0; plain 0-1; rich 0-2.
- Each exit needs either destinationIntent (new unresolved exit) or connectTo (link to existing room).
- You may connect an exit to an adjacent room listed in <adjacent-rooms> by setting connectTo to its ID. When connecting, also set backExitName and backExitDescription for the return passage on that room. Only connect when narratively natural (corridors circling back, shortcuts, alternate routes). Don't force connections.
- You may update the entry exit (exitUpdate) if, now that the destination is known, its name/description should change.
- Rooms are lit by default — only set "dark" for pitch-black rooms requiring a light source.
- Set aiPrompt if there's useful context for future AI operations in this room.
- Room contents should use existing tags and properties from the available lists.
</guidelines>`;
}
