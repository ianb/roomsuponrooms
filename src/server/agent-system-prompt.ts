import type { EntityStore } from "../core/entity.js";
import type { GamePrompts } from "../core/game-data.js";
import { HandlerLib } from "../core/handler-lib.js";
import { describeTracksForAuthoring } from "../core/progression.js";
import type { Track } from "../core/progression.js";
import { collectTags, describeProperties } from "./ai-prompt-helpers.js";
import {
  ROLE_SECTION,
  WORLD_MODEL_SECTION,
  MOVEMENT_SECTION,
  QUERY_SECTION,
  APPLY_EDITS_SECTION,
  PLAYTEST_SECTION,
  SCENERY_SECTION,
  RULES_SECTION,
} from "./agent-prompt-sections.js";

/**
 * The lib API available inside handler check/veto/perform bodies. Generated
 * from the game's actual lib class so game-specific extensions are included.
 * Models invent plausible-but-nonexistent functions (lib.sendEvent, lib.emit)
 * unless the real surface is spelled out.
 */
function buildLibSection(libClass: typeof HandlerLib): string {
  const lines = libClass
    .describeLib()
    .map((line) => `  - ${line}`)
    .join("\n");
  return `<handler-lib-api>
Handler code bodies (check/veto/perform) run in a sandbox with these variables in scope: lib, object, indirect (ditransitive only), player, room, store, command. The COMPLETE lib API:
${lines}

These are the ONLY lib functions — do not invent others (there is no lib.sendEvent, lib.emit, lib.message, or lib.update). To change world state, return events from perform; build them with lib.setEvent / lib.moveEvent / lib.createEvent or as literal { type, entityId, property, value, description } objects.
</handler-lib-api>`;
}

/**
 * Build the system prompt for the world-editing agent. The agent's tools
 * are introspectable via their `description` fields, so the system prompt
 * focuses on the world model, the rules, and tone.
 */
export function buildAgentSystemPrompt({
  store,
  prompts,
  libClass,
  tracks,
}: {
  store: EntityStore;
  prompts?: GamePrompts;
  libClass?: typeof HandlerLib;
  tracks?: Track[];
}): string {
  const sections: string[] = [];

  sections.push(ROLE_SECTION);
  if (prompts && prompts.world) {
    sections.push(`<world-style>\n${prompts.world}\n</world-style>`);
  }
  if (prompts && prompts.worldCreate) {
    sections.push(`<creation-guidelines>\n${prompts.worldCreate}\n</creation-guidelines>`);
  }
  sections.push(WORLD_MODEL_SECTION);
  sections.push(MOVEMENT_SECTION);
  sections.push(QUERY_SECTION);
  sections.push(APPLY_EDITS_SECTION);
  sections.push(buildLibSection(libClass || HandlerLib));
  sections.push(PLAYTEST_SECTION);
  sections.push(SCENERY_SECTION);
  sections.push(`<existing-tags>\n${collectTags(store).join(", ")}\n</existing-tags>`);
  sections.push(`<available-properties>\n${describeProperties(store)}\n</available-properties>`);
  sections.push(`<available-tracks>\n${describeTracksForAuthoring(tracks)}\n</available-tracks>`);
  sections.push(RULES_SECTION);
  return sections.join("\n\n");
}
