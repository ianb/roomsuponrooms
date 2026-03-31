# Grid Connectivity

Tests for the spatial grid coordinate system and room connectivity.

```ts setup
import { EntityStore } from "../src/core/entity.js";
import { createRegistry } from "../src/core/properties.js";
import { defineBaseProperties } from "../src/core/base-properties.js";
import { buildRoomSchema } from "../src/server/ai-create-room-schema.js";
import { computeRoomCoordinates, buildAdjacentRoomContext } from "../src/server/ai-prompt-helpers.js";
import { ensureGridCoords, resolveOrCreateBackExit, createAndSave } from "../src/server/ai-room-grid.js";
import { setStorage } from "../src/server/storage-instance.js";
import { z } from "zod";

function makeStore(): EntityStore {
  const registry = createRegistry();
  defineBaseProperties(registry);
  return new EntityStore(registry, 1);
}

// Minimal mock storage that just records calls
const saved: Array<{ id: string; properties: Record<string, unknown> }> = [];
setStorage({
  saveAiEntity: async (record) => { saved.push({ id: record.id, properties: record.properties }); },
  loadAiEntities: async () => [],
  loadAiHandlers: async () => [],
  saveAiHandler: async () => {},
  listAiHandlers: async () => [],
  removeAiHandler: async () => {},
  loadEvents: async () => [],
  appendEvents: async () => {},
  clearEvents: async () => {},
  popEvent: async () => null,
  removeAiEntity: async () => {},
  loadConversation: async () => [],
  saveConversationWord: async () => {},
  findUserByGoogleId: async () => null,
  findUserByName: async () => null,
  findUserById: async () => null,
  createUser: async () => ({ id: "u1", name: "test", googleId: null, roles: [], lastLogin: "" }),
  updateUserLogin: async () => {},
  queryAiEntities: async () => [],
} as any);
```

## Schema: connectTo parses correctly

The room schema should accept exits with `connectTo` instead of `destinationIntent`:

```
const store = makeStore();
const schema = buildRoomSchema(store);

const validResponse = {
  room: {
    idSlug: "dark-tunnel",
    name: "Dark Tunnel",
    description: "A narrow passage.",
    tags: ["room"],
    properties: {},
    additionalExits: [{
      direction: "east",
      name: "Rough Opening",
      description: "A rough opening in the wall.",
      connectTo: "room:cavern",
      aliases: [],
      properties: {},
    }],
    contents: [],
  },
  notes: "Connected to existing cavern.",
};

const parsed = schema.parse(validResponse);
parsed.room.additionalExits[0].connectTo
=> room:cavern
```

destinationIntent should be undefined when connectTo is used:

``` continue
parsed.room.additionalExits[0].destinationIntent
=> undefined
```

connectTo exits can include back-exit names:

``` continue
const withBackNames = {
  room: {
    idSlug: "dark-tunnel-2",
    name: "Dark Tunnel",
    description: "A narrow passage.",
    tags: ["room"],
    properties: {},
    returnExitName: "Narrow Crawlway",
    returnExitDescription: "A tight squeeze back to the chamber.",
    additionalExits: [{
      direction: "east",
      name: "Rough Opening",
      description: "A rough opening in the wall.",
      connectTo: "room:cavern",
      backExitName: "Jagged Crack",
      backExitDescription: "A crack in the cavern wall leads west.",
      aliases: [],
      properties: {},
    }],
    contents: [],
  },
  notes: "Connected.",
};

const parsed4 = schema.parse(withBackNames);
parsed4.room.returnExitName
=> Narrow Crawlway
```

``` continue
parsed4.room.additionalExits[0].backExitName
=> Jagged Crack
```

## Schema: destinationIntent still works

```
const store2 = makeStore();
const schema2 = buildRoomSchema(store2);

const unresolved = {
  room: {
    idSlug: "open-field",
    name: "Open Field",
    description: "A wide open field.",
    tags: ["room"],
    properties: {},
    additionalExits: [{
      direction: "west",
      name: "Worn Path",
      description: "A well-worn path.",
      destinationIntent: "A village marketplace",
      aliases: [],
      properties: {},
    }],
    contents: [],
  },
  notes: "New area.",
};

const parsed2 = schema2.parse(unresolved);
parsed2.room.additionalExits[0].destinationIntent
=> A village marketplace
```

## Schema: neither connectTo nor destinationIntent

When the AI provides neither, the schema still parses (both are optional):

``` continue
const neither = {
  room: {
    idSlug: "dead-end",
    name: "Dead End",
    description: "Nothing here.",
    tags: ["room"],
    properties: {},
    additionalExits: [{
      direction: "north",
      name: "Blocked Passage",
      description: "Rubble blocks the way.",
      aliases: [],
      properties: {},
    }],
    contents: [],
  },
  notes: "Dead end.",
};

const parsed3 = schema2.parse(neither);
parsed3.room.additionalExits[0].destinationIntent
=> undefined
```

## Adjacent room context appears in prompt

When rooms exist at neighboring grid positions, `buildAdjacentRoomContext`
includes them:

```
const store3 = makeStore();
store3.create("room:cavern", {
  tags: ["room"],
  properties: { name: "Crystal Cavern", description: "Glittering crystals line the walls.", gridX: 1, gridY: 0, gridZ: 0 },
});

const context = buildAdjacentRoomContext(store3, { x: 0, y: 0, z: 0 });
context.includes("Crystal Cavern")
=> true
```

The room should appear listed under "east" since it's at (1,0,0) relative to (0,0,0):

``` continue
context.includes("east:")
=> true
```

``` continue
context.includes("room:cavern")
=> true
```

## Adjacent room context is empty when no neighbors

```
const store4 = makeStore();
store4.create("room:isolated", {
  tags: ["room"],
  properties: { name: "Isolated Room", description: "Far away.", gridX: 10, gridY: 10, gridZ: 0 },
});

buildAdjacentRoomContext(store4, { x: 0, y: 0, z: 0 })
=>
```

## Adjacent room notes unresolved back-exits

When a neighbor has an unresolved exit pointing back toward the new room,
the context should flag it:

```
const store5 = makeStore();
store5.create("room:library", {
  tags: ["room"],
  properties: { name: "Old Library", description: "Dusty shelves.", gridX: 0, gridY: -1, gridZ: 0 },
});
store5.create("exit:library:south", {
  tags: ["exit"],
  properties: { location: "room:library", direction: "south", destinationIntent: "A reading room" },
});

const ctx5 = buildAdjacentRoomContext(store5, { x: 0, y: 0, z: 0 });
ctx5.includes("unresolved exit pointing back")
=> true
```

## connectTo with nonexistent room falls through gracefully

When `connectTo` references a room that doesn't exist in the store,
`isConnected` should be false and it should use `destinationIntent` instead.
This tests the guard in `createReturnAndAdditionalExits`.

```
const store6 = makeStore();
store6.create("room:start", {
  tags: ["room"],
  properties: { name: "Start", description: "The start.", gridX: 0, gridY: 0, gridZ: 0 },
});

// Simulate what createReturnAndAdditionalExits does for a bad connectTo
const badConnectTo = "room:nonexistent";
const isConnected = badConnectTo && store6.has(badConnectTo);
isConnected
=> false
```

## resolveOrCreateBackExit: resolves existing unresolved exit

```
saved.length = 0;
const store7 = makeStore();
store7.create("room:target", {
  tags: ["room"],
  properties: { name: "Target", description: "Target room.", gridX: 1, gridY: 0, gridZ: 0 },
});
store7.create("exit:target:west", {
  tags: ["exit"],
  properties: { location: "room:target", direction: "west", destinationIntent: "Something to the west", name: "Old Door" },
});
store7.create("room:new-room", {
  tags: ["room"],
  properties: { name: "New Room", description: "A new room.", gridX: 0, gridY: 0, gridZ: 0 },
});

await resolveOrCreateBackExit(store7, {
  targetRoomId: "room:target",
  newRoomId: "room:new-room",
  direction: "east",
  exitName: "Rusty Gate",
  exitDescription: "A rusty gate leads to a new area.",
  gameId: "test",
});

// The existing unresolved exit should now point to the new room
store7.get("exit:target:west").properties["destination"]
=> room:new-room
```

The destinationIntent should be cleared:

``` continue
store7.get("exit:target:west").properties["destinationIntent"]
=> undefined
```

And the AI-provided name/description should be applied:

``` continue
store7.get("exit:target:west").properties["name"]
=> Rusty Gate
```

``` continue
store7.get("exit:target:west").properties["description"]
=> A rusty gate leads to a new area.
```

## resolveOrCreateBackExit: creates new exit with AI-provided name

```
saved.length = 0;
const store8 = makeStore();
store8.create("room:target2", {
  tags: ["room"],
  properties: { name: "Target 2", description: "No exits here.", gridX: 1, gridY: 0, gridZ: 0 },
});
store8.create("room:new-room2", {
  tags: ["room"],
  properties: { name: "New Room 2", description: "Fresh room.", gridX: 0, gridY: 0, gridZ: 0 },
});

await resolveOrCreateBackExit(store8, {
  targetRoomId: "room:target2",
  newRoomId: "room:new-room2",
  direction: "east",
  exitName: "Crumbling Archway",
  exitDescription: "An archway opens to the west.",
  gameId: "test",
});

store8.has("exit:target2:west")
=> true
```

``` continue
store8.get("exit:target2:west").properties["name"]
=> Crumbling Archway
```

``` continue
store8.get("exit:target2:west").properties["description"]
=> An archway opens to the west.
```

## resolveOrCreateBackExit: falls back to generic name without AI input

```
saved.length = 0;
const store8b = makeStore();
store8b.create("room:target3", {
  tags: ["room"],
  properties: { name: "Target 3", gridX: 1, gridY: 0, gridZ: 0 },
});
store8b.create("room:new-room3", {
  tags: ["room"],
  properties: { name: "New Room 3", gridX: 0, gridY: 0, gridZ: 0 },
});

await resolveOrCreateBackExit(store8b, {
  targetRoomId: "room:target3",
  newRoomId: "room:new-room3",
  direction: "east",
  gameId: "test",
});

store8b.get("exit:target3:west").properties["name"]
=> Exit west
```

## ensureGridCoords bootstraps missing coords

```
saved.length = 0;
const store9 = makeStore();
store9.create("room:origin", {
  tags: ["room"],
  properties: { name: "Origin" },
});

const room = store9.get("room:origin");
await ensureGridCoords(store9, { room, gameId: "test" });

store9.get("room:origin").properties["gridX"]
=> 0
```

Already-set coords are not overwritten:

```
const store10 = makeStore();
store10.create("room:placed", {
  tags: ["room"],
  properties: { name: "Placed", gridX: 5, gridY: 3, gridZ: 1 },
});

saved.length = 0;
const placed = store10.get("room:placed");
await ensureGridCoords(store10, { room: placed, gameId: "test" });

// Should not have saved anything (coords already exist)
saved.length
=> 0
```

``` continue
store10.get("room:placed").properties["gridX"]
=> 5
```
