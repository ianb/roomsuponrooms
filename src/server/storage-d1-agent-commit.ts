import type { D1Database, D1PreparedStatement, EntityRow, HandlerRow } from "./d1-types.js";
import { authoringBindValues } from "./d1-types.js";
import type { AiEntityRecord, AiHandlerRecord, AuthoringInfo, WordEntryRecord } from "./storage.js";
import type { EntityData, HandlerData } from "../core/game-data.js";
import type { WordEntry } from "../core/conversation.js";
import { deserializeEntityRow, serializeEntityRecord } from "./entity-serialize.js";
import { playSessionEdits, conversationKey } from "./agent-edit-merge.js";
import { getAgentSession, getSessionEdits, updateAgentSession } from "./storage-d1-agent.js";

class SessionNotFoundError extends Error {
  override name = "SessionNotFoundError";
  constructor(id: string) {
    super(`Agent session not found: ${id}`);
  }
}

function entityRecordFromHandlerRow(row: HandlerRow): HandlerData {
  // The data column already contains the full HandlerData (legacy
  // saveHandler stringifies the whole record). Strip the metadata fields
  // injected by AiHandlerRecord so we get back to a clean HandlerData.
  const parsed = JSON.parse(row.data) as HandlerData & {
    createdAt?: unknown;
    gameId?: unknown;
    authoring?: unknown;
  };
  const { createdAt: _ca, gameId: _gid, authoring: _au, ...rest } = parsed;
  return rest as HandlerData;
}

async function loadStartStates(
  db: D1Database,
  {
    gameId,
    entityIds,
    handlerNames,
    conversationTargets,
  }: {
    gameId: string;
    entityIds: Set<string>;
    handlerNames: Set<string>;
    conversationTargets: Array<{ npcId: string; word: string }>;
  },
): Promise<{
  startEntities: Map<string, EntityData | null>;
  startHandlers: Map<string, HandlerData | null>;
  startConversations: Map<string, WordEntry | null>;
}> {
  const startEntities = new Map<string, EntityData | null>();
  for (const id of entityIds) {
    const row = await db
      .prepare("SELECT * FROM ai_entities WHERE game_id = ? AND id = ?")
      .bind(gameId, id)
      .first<EntityRow>();
    startEntities.set(id, row ? deserializeEntityRow(row) : null);
  }
  const startHandlers = new Map<string, HandlerData | null>();
  for (const name of handlerNames) {
    const row = await db
      .prepare("SELECT * FROM ai_handlers WHERE game_id = ? AND name = ?")
      .bind(gameId, name)
      .first<HandlerRow>();
    startHandlers.set(name, row ? entityRecordFromHandlerRow(row) : null);
  }
  const startConversations = new Map<string, WordEntry | null>();
  for (const { npcId, word } of conversationTargets) {
    const entryJson = await db
      .prepare(
        "SELECT entry FROM conversation_entries WHERE game_id = ? AND npc_id = ? AND word = ?",
      )
      .bind(gameId, npcId, word)
      .first<string>("entry");
    startConversations.set(
      conversationKey(npcId, word),
      entryJson ? (JSON.parse(entryJson) as WordEntry) : null,
    );
  }
  return { startEntities, startHandlers, startConversations };
}

function buildEntityWriteStatement(
  db: D1Database,
  {
    gameId,
    id,
    finalState,
    authoring,
    now,
  }: {
    gameId: string;
    id: string;
    finalState: EntityData | null;
    authoring: AuthoringInfo;
    now: string;
  },
): D1PreparedStatement {
  if (finalState === null) {
    return db.prepare("DELETE FROM ai_entities WHERE game_id = ? AND id = ?").bind(gameId, id);
  }
  const record: AiEntityRecord = {
    ...finalState,
    id,
    createdAt: now,
    gameId,
    authoring,
  };
  return db
    .prepare(
      `INSERT OR REPLACE INTO ai_entities
       (game_id, id, tags, properties, created_at, created_by, creation_source, creation_command)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      gameId,
      id,
      JSON.stringify(record.tags),
      serializeEntityRecord(record),
      now,
      ...authoringBindValues(authoring),
    );
}

function buildHandlerWriteStatement(
  db: D1Database,
  {
    gameId,
    name,
    finalState,
    authoring,
    now,
  }: {
    gameId: string;
    name: string;
    finalState: HandlerData | null;
    authoring: AuthoringInfo;
    now: string;
  },
): D1PreparedStatement {
  if (finalState === null) {
    return db.prepare("DELETE FROM ai_handlers WHERE game_id = ? AND name = ?").bind(gameId, name);
  }
  const record: AiHandlerRecord = {
    ...finalState,
    name,
    createdAt: now,
    gameId,
    authoring,
  };
  return db
    .prepare(
      `INSERT OR REPLACE INTO ai_handlers
       (game_id, name, data, created_at, created_by, creation_source, creation_command)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(gameId, name, JSON.stringify(record), now, ...authoringBindValues(authoring));
}

/**
 * Atomically apply a session's pending edits:
 *  - Read the current materialized state for each touched target
 *  - Play the edits forward in seq order to compute prior_state per edit
 *    and the final post-session state per target
 *  - Build a batch of UPDATE/INSERT/DELETE statements against ai_entities,
 *    ai_handlers, world_edits, and agent_sessions
 *  - Execute as a single D1 batch
 */
export async function commitSession(
  db: D1Database,
  { sessionId, summary }: { sessionId: string; summary: string },
): Promise<void> {
  const session = await getAgentSession(db, sessionId);
  if (!session) throw new SessionNotFoundError(sessionId);

  const edits = await getSessionEdits(db, sessionId);
  const pending = edits.filter((e) => !e.applied);
  if (pending.length === 0) {
    await updateAgentSession(db, {
      id: sessionId,
      patch: {
        status: "finished",
        summary,
        finishedAt: new Date().toISOString(),
      },
    });
    return;
  }

  const entityIds = new Set<string>();
  const handlerNames = new Set<string>();
  const conversationTargets: Array<{ npcId: string; word: string }> = [];
  for (const edit of pending) {
    if (edit.targetKind === "entity") entityIds.add(edit.targetId);
    else if (edit.targetKind === "handler") handlerNames.add(edit.targetId);
    else {
      const entry = edit.payload as WordEntry;
      conversationTargets.push({ npcId: edit.targetId, word: entry.word });
    }
  }

  const { startEntities, startHandlers, startConversations } = await loadStartStates(db, {
    gameId: session.gameId,
    entityIds,
    handlerNames,
    conversationTargets,
  });

  const played = playSessionEdits(pending, { startEntities, startHandlers, startConversations });

  const statements: D1PreparedStatement[] = [];
  const now = new Date().toISOString();
  const authoring: AuthoringInfo = {
    createdBy: session.userId,
    creationSource: "agent",
    creationCommand: session.id,
  };

  for (const { edit, priorState } of played.resolved) {
    statements.push(
      db
        .prepare("UPDATE world_edits SET prior_state = ?, applied = 1 WHERE seq = ?")
        .bind(priorState === null ? null : JSON.stringify(priorState), edit.seq),
    );
  }

  for (const [id, finalState] of played.finalEntityState) {
    statements.push(
      buildEntityWriteStatement(db, {
        gameId: session.gameId,
        id,
        finalState,
        authoring,
        now,
      }),
    );
  }

  for (const [name, finalState] of played.finalHandlerState) {
    statements.push(
      buildHandlerWriteStatement(db, {
        gameId: session.gameId,
        name,
        finalState,
        authoring,
        now,
      }),
    );
  }

  for (const { npcId, entry } of played.finalConversationState.values()) {
    const record: WordEntryRecord = {
      ...entry,
      createdAt: now,
      gameId: session.gameId,
      npcId,
      authoring,
    };
    statements.push(
      db
        .prepare(
          `INSERT OR REPLACE INTO conversation_entries
           (game_id, user_id, npc_id, word, entry, created_at, created_by, creation_source, creation_command)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          session.gameId,
          "shared",
          npcId,
          entry.word,
          JSON.stringify(record),
          now,
          ...authoringBindValues(authoring),
        ),
    );
  }

  statements.push(
    db
      .prepare(
        `UPDATE agent_sessions
         SET status = 'finished', summary = ?, finished_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(summary, now, now, sessionId),
  );

  await db.batch(statements);
}
