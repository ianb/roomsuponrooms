import type { EntityStore } from "../core/entity.js";
import type { VerbRegistry } from "../core/verbs.js";
import type { RuntimeStorage, WorldEditRecord } from "./storage.js";

/**
 * Mutable per-tick context shared by all agent tools. The factory in
 * agent-tools.ts captures this once and the tools mutate it as the agent
 * works.
 *
 * - `store` and `verbs` reflect (live ⊕ pending session edits) and the tools
 *   apply each newly-emitted edit to them so subsequent reads see it.
 * - `pendingEdits` is the in-memory copy of all edits this tick has
 *   appended to the log; used by query tools that want a self-only view.
 * - `terminate` is set by finish() / bail() to signal the loop to stop.
 */
export interface ToolContext {
  storage: RuntimeStorage;
  gameId: string;
  /** Human user who owns the session — used to scope per-user reads like loadEvents. */
  userId: string;
  sessionId: string;
  store: EntityStore;
  verbs: VerbRegistry;
  pendingEdits: WorldEditRecord[];
  savedVars: Record<string, unknown>;
  terminate: { kind: "finish" | "bail"; summary: string } | null;
  /**
   * True when apply_edits has succeeded more recently than the last
   * successful playtest. finish() refuses to commit while this is set —
   * models otherwise skip verification and commit broken changes.
   * Initialized from the message history on each tick.
   */
  editsSinceLastPlaytest: boolean;
  /**
   * True once the agent has run at least one query this session. The first
   * apply_edits is rejected until then — edits should be grounded in the
   * actual world (existing ids, names, aliases), not guessed. Initialized
   * from the message history on each tick.
   */
  hasQueriedWorld: boolean;
}
