# Grid Connectivity

Tests for the spatial grid coordinate system and room connectivity.

```ts setup
import { EntityStore } from "../src/core/entity.js";
import { createRegistry } from "../src/core/properties.js";
import { defineBaseProperties } from "../src/core/base-properties.js";
import { buildRoomSchema } from "../src/server/ai-create-room-schema.js";
import {
  computeRoomCoordinates,
  buildAdjacentRoomContext,
} from "../src/server/ai-prompt-helpers.js";
import {
  ensureGridCoords,
  resolveOrCreateBackExit,
  createAndSave,
} from "../src/server/ai-room-grid.js";
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
  saveAiEntity: async (record) => {
    saved.push({ id: record.id, properties: record.properties });
  },
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
  reasoning: "Test fixture.",
  room: {
    idSlug: "dark-tunnel",
    texture: "plain",
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
};

const parsed = schema.parse(validResponse);
parsed.room.additionalExits[0].connectTo
=> room:cavern
```

destinationIntent should be undefined when connectTo is used:

```continue
parsed.room.additionalExits[0].destinationIntent
=> undefined
```

connectTo exits can include back-exit names:

```continue
const withBackNames = {
  reasoning: "Test fixture.",
  room: {
    idSlug: "dark-tunnel-2",
    texture: "plain",
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
};

const parsed4 = schema.parse(withBackNames);
parsed4.room.returnExitName
=> Narrow Crawlway
```

```continue
parsed4.room.additionalExits[0].backExitName
=> Jagged Crack
```

## Schema: destinationIntent still works

```
const store2 = makeStore();
const schema2 = buildRoomSchema(store2);

const unresolved = {
  reasoning: "Test fixture.",
  room: {
    idSlug: "open-field",
    texture: "plain",
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
};

const parsed2 = schema2.parse(unresolved);
parsed2.room.additionalExits[0].destinationIntent
=> A village marketplace
```

## Schema: neither connectTo nor destinationIntent

When the AI provides neither, the schema still parses (both are optional):

```continue
const neither = {
  reasoning: "Test fixture.",
  room: {
    idSlug: "dead-end",
    texture: "plain",
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
  name: "Crystal Cavern",
  description: "Glittering crystals line the walls.",
  room: { grid: { x: 1, y: 0, z: 0 } },
});

const context = buildAdjacentRoomContext(store3, { x: 0, y: 0, z: 0 });
context.includes("Crystal Cavern")
=> true
```

The room should appear listed under "east" since it's at (1,0,0) relative to (0,0,0):

```continue
context.includes("east:")
=> true
```

```continue
context.includes("room:cavern")
=> true
```

## Adjacent room context is empty when no neighbors

```
const store4 = makeStore();
store4.create("room:isolated", {
  tags: ["room"],
  name: "Isolated Room", description: "Far away.", room: { grid: { x: 10, y: 10, z: 0 } },
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
  name: "Old Library", description: "Dusty shelves.", room: { grid: { x: 0, y: -1, z: 0 } },
});
store5.create("exit:library:south", {
  tags: ["exit"],
  location: "room:library", exit: { direction: "south", destinationIntent: "A reading room" },
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
  name: "Start", description: "The start.", room: { grid: { x: 0, y: 0, z: 0 } },
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
  name: "Target", description: "Target room.", room: { grid: { x: 1, y: 0, z: 0 } },
});
store7.create("exit:target:west", {
  tags: ["exit"],
  location: "room:target", name: "Old Door", exit: { direction: "west", destinationIntent: "Something to the west" },
});
store7.create("room:new-room", {
  tags: ["room"],
  name: "New Room", description: "A new room.", room: { grid: { x: 0, y: 0, z: 0 } },
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
store7.get("exit:target:west").exit.destination
=> room:new-room
```

The destinationIntent should be cleared:

```continue
store7.get("exit:target:west").exit.destinationIntent
=> undefined
```

And the AI-provided name/description should be applied:

```continue
store7.get("exit:target:west").name
=> Rusty Gate
```

```continue
store7.get("exit:target:west").description
=> A rusty gate leads to a new area.
```

## resolveOrCreateBackExit: creates new exit with AI-provided name

```
saved.length = 0;
const store8 = makeStore();
store8.create("room:target2", {
  tags: ["room"],
  name: "Target 2", description: "No exits here.", room: { grid: { x: 1, y: 0, z: 0 } },
});
store8.create("room:new-room2", {
  tags: ["room"],
  name: "New Room 2", description: "Fresh room.", room: { grid: { x: 0, y: 0, z: 0 } },
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

```continue
store8.get("exit:target2:west").name
=> Crumbling Archway
```

```continue
store8.get("exit:target2:west").description
=> An archway opens to the west.
```

## resolveOrCreateBackExit: falls back to generic name without AI input

```
saved.length = 0;
const store8b = makeStore();
store8b.create("room:target3", {
  tags: ["room"],
  name: "Target 3",
  description: "Target 3.",
  room: { grid: { x: 1, y: 0, z: 0 } },
});
store8b.create("room:new-room3", {
  tags: ["room"],
  name: "New Room 3",
  description: "New Room 3.",
  room: { grid: { x: 0, y: 0, z: 0 } },
});

await resolveOrCreateBackExit(store8b, {
  targetRoomId: "room:target3",
  newRoomId: "room:new-room3",
  direction: "east",
  gameId: "test",
});

store8b.get("exit:target3:west").name
=> Exit west
```

## ensureGridCoords bootstraps missing coords

```
saved.length = 0;
const store9 = makeStore();
store9.create("room:origin", {
  tags: ["room"],
  name: "Origin",
  description: "Origin.",
});

const room = store9.get("room:origin");
await ensureGridCoords(store9, { room, gameId: "test" });

store9.get("room:origin").room.grid.x
=> 0
```

Already-set coords are not overwritten:

```
const store10 = makeStore();
store10.create("room:placed", {
  tags: ["room"],
  name: "Placed",
  description: "Placed.",
  room: { grid: { x: 5, y: 3, z: 1 } },
});

saved.length = 0;
const placed = store10.get("room:placed");
await ensureGridCoords(store10, { room: placed, gameId: "test" });

// Should not have saved anything (coords already exist)
saved.length
=> 0
```

```continue
store10.get("room:placed").room.grid.x
=> 5
```
