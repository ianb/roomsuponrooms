import t from "tap";
import "../src/games/test-world.js";
import { getGame } from "../src/games/registry.js";
import { applyPendingEditsToWorld } from "../src/server/agent-world-view.js";
import { applyAiEntityRecords } from "../src/server/apply-ai-records.js";
import type { AiEntityRecord, WorldEditRecord } from "../src/server/storage.js";
import type { EntityData, HandlerData } from "../src/core/game-data.js";

function freshGame() {
  const def = getGame("test")!;
  return def.create();
}

function edit(overrides: Partial<WorldEditRecord>): WorldEditRecord {
  return {
    seq: 1,
    gameId: "test",
    sessionId: "s-test",
    targetKind: "entity",
    targetId: "item:thing",
    op: "create",
    payload: null,
    priorState: null,
    applied: false,
    createdAt: "2026-04-09T00:00:00Z",
    ...overrides,
  };
}

t.test("create edit shows up in the agent's view", (t) => {
  const game = freshGame();
  const payload: EntityData = {
    id: "item:lantern",
    tags: ["portable"],
    name: "Brass Lantern",
    description: "A polished brass lantern.",
    location: "room:clearing",
  };
  applyPendingEditsToWorld([edit({ targetId: "item:lantern", op: "create", payload })], {
    store: game.store,
    verbs: game.verbs,
    gameId: "test",
  });
  t.ok(game.store.has("item:lantern"));
  t.equal(game.store.get("item:lantern").name, "Brass Lantern");
  t.equal(game.store.get("item:lantern").location, "room:clearing");
  t.end();
});

t.test("update edit overlays existing entity, properties null erases", (t) => {
  const game = freshGame();
  // Use an existing room from test-world
  const existing = game.store.get("room:clearing");
  const originalDesc = existing.description;
  game.store.setProperty("room:clearing", { name: "lit", value: true });
  game.store.setProperty("room:clearing", { name: "score", value: 5 });

  applyPendingEditsToWorld(
    [
      edit({
        targetId: "room:clearing",
        op: "update",
        payload: {
          name: "Bright Clearing",
          properties: { lit: null, score: 10 },
        } as Partial<EntityData>,
      }),
    ],
    { store: game.store, verbs: game.verbs, gameId: "test" },
  );
  const r = game.store.get("room:clearing");
  t.equal(r.name, "Bright Clearing");
  t.equal(r.description, originalDesc, "untouched fields preserved");
  t.equal(r.properties.lit, undefined, "null erases property");
  t.equal(r.properties.score, 10);
  t.end();
});

t.test("delete edit removes entity from store", (t) => {
  const game = freshGame();
  // Pick a portable item from test-world (or create one and then delete it)
  applyPendingEditsToWorld(
    [
      edit({
        targetId: "item:gem",
        op: "create",
        payload: {
          id: "item:gem",
          tags: ["portable"],
          name: "Gem",
          description: "A gem.",
          location: "room:clearing",
        } as EntityData,
      }),
      edit({
        seq: 2,
        targetId: "item:gem",
        op: "delete",
        payload: null,
      }),
    ],
    { store: game.store, verbs: game.verbs, gameId: "test" },
  );
  t.notOk(game.store.has("item:gem"));
  t.end();
});

t.test("edits are not visible on a fresh game (no leak)", (t) => {
  const game1 = freshGame();
  applyPendingEditsToWorld(
    [
      edit({
        targetId: "item:phantom",
        op: "create",
        payload: {
          id: "item:phantom",
          tags: ["portable"],
          name: "Phantom",
          description: "Boo.",
          location: "room:clearing",
        } as EntityData,
      }),
    ],
    { store: game1.store, verbs: game1.verbs, gameId: "test" },
  );
  t.ok(game1.store.has("item:phantom"));
  // A second freshly-loaded game should not see the phantom — proves the
  // pending edit is purely an in-memory overlay, not a write to game data.
  const game2 = freshGame();
  t.notOk(game2.store.has("item:phantom"));
  t.end();
});

t.test("handler create edit registers a verb", async (t) => {
  const game = freshGame();
  const handlerData: HandlerData = {
    name: "test:custom-shout",
    pattern: { verb: "shout", form: "intransitive" },
    perform: 'return { output: "You shout into the void.", events: [] };',
  };
  applyPendingEditsToWorld(
    [
      edit({
        targetKind: "handler",
        targetId: "test:custom-shout",
        op: "create",
        payload: handlerData,
      }),
    ],
    { store: game.store, verbs: game.verbs, gameId: "test" },
  );
  // Verify the handler exists by trying to dispatch the verb
  const player = game.store.findByTag("player")[0]!;
  const room = game.store.get(player.location);
  const result = await game.verbs.dispatch({
    store: game.store,
    player,
    room,
    command: { verb: "shout", form: "intransitive" },
  });
  t.equal(result.outcome, "performed");
  if (result.outcome === "performed") {
    t.match(result.output, /shout/);
  }
});

t.test("partial overlay records preserve base-game fields on reload", (t) => {
  // Regression for the "Undefined" title bug. A partial AI record on a
  // base-game entity must merge as an overlay, not unconditionally wipe
  // top-level fields with undefined.
  const game = freshGame();
  const baseRoom = game.store.get("room:clearing");
  t.equal(baseRoom.name, "Forest Clearing", "starts with base name");

  const partialRecord = {
    id: "room:clearing",
    description: "A bright clearing dappled with new sunlight.",
    createdAt: "2026-04-09T00:00:00Z",
    gameId: "test",
    authoring: { createdBy: "agent", creationSource: "agent" },
  } as unknown as AiEntityRecord;

  applyAiEntityRecords([partialRecord], game.store);
  const after = game.store.get("room:clearing");
  t.equal(after.name, "Forest Clearing", "name preserved (was the bug)");
  t.equal(after.description, "A bright clearing dappled with new sunlight.");
  t.ok(after.tags.includes("room"), "tags preserved");
  t.end();
});

t.test("handler delete edit removes the verb", async (t) => {
  const game = freshGame();
  const handlerData: HandlerData = {
    name: "test:custom-bark",
    pattern: { verb: "bark", form: "intransitive" },
    perform: 'return { output: "Woof.", events: [] };',
  };
  applyPendingEditsToWorld(
    [
      edit({
        targetKind: "handler",
        targetId: "test:custom-bark",
        op: "create",
        payload: handlerData,
      }),
      edit({
        seq: 2,
        targetKind: "handler",
        targetId: "test:custom-bark",
        op: "delete",
        payload: null,
      }),
    ],
    { store: game.store, verbs: game.verbs, gameId: "test" },
  );
  const player = game.store.findByTag("player")[0]!;
  const room = game.store.get(player.location);
  const result = await game.verbs.dispatch({
    store: game.store,
    player,
    room,
    command: { verb: "bark", form: "intransitive" },
  });
  t.equal(result.outcome, "unhandled");
});
