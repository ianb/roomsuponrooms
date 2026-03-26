# AI Entity Store

```ts setup
import { EntityStore } from "../src/core/entity.js";
import { createRegistry, defineProperty } from "../src/core/properties.js";
import { defineBaseProperties } from "../src/core/base-properties.js";
import { saveAiEntity, loadAiEntities, removeAiEntity } from "../src/server/ai-entity-store.js";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

function makeStore(): EntityStore {
  const registry = createRegistry();
  defineBaseProperties(registry);
  return new EntityStore(registry, 1);
}

const testGameId = "test-ai-entity";
const testFile = resolve(process.cwd(), `data/ai-entities-${testGameId}.jsonl`);
function cleanup(): void {
  if (existsSync(testFile)) rmSync(testFile);
}
```

## Basic save and load

New entities are created in the store on load:

```
cleanup();
const store = makeStore();
saveAiEntity({
  createdAt: "2024-01-01T00:00:00Z",
  gameId: testGameId,
  id: "item:test-widget",
  tags: ["portable"],
  properties: { name: "Widget", description: "A test widget" },
});
loadAiEntities(testGameId, store);
store.has("item:test-widget")
=> true
```

``` continue
store.get("item:test-widget").properties["name"]
=> Widget
```

``` continue
cleanup();
```

## Property overrides on existing entities

When an AI entity record refers to an entity that already exists,
its properties are applied as overrides:

```
cleanup();
const store2 = makeStore();
store2.create("room:garden", {
  tags: ["room"],
  properties: { name: "Garden" },
});
store2.create("exit:test-door", {
  tags: ["exit"],
  properties: {
    name: "Old Door",
    direction: "north",
    destinationIntent: "A hidden garden",
  },
});
saveAiEntity({
  createdAt: "2024-01-01T00:00:00Z",
  gameId: testGameId,
  id: "exit:test-door",
  tags: ["exit"],
  properties: {
    name: "Garden Door",
    direction: "north",
    destination: "room:garden",
    destinationIntent: null,
  },
});
loadAiEntities(testGameId, store2);
store2.get("exit:test-door").properties["name"]
=> Garden Door
```

``` continue
store2.get("exit:test-door").properties["destination"]
=> room:garden
```

The destinationIntent should be removed (null triggers removeProperty):

``` continue
store2.get("exit:test-door").properties["destinationIntent"]
=> undefined
```

``` continue
cleanup();
```

## Undefined values are saved as null

When saving an entity with undefined property values, they are
converted to null for JSON serialization:

```
cleanup();
const store3 = makeStore();
store3.create("item:test-cleared", {
  tags: ["portable"],
  properties: { name: "Original", description: "Has a field" },
});
saveAiEntity({
  createdAt: "2024-01-01T00:00:00Z",
  gameId: testGameId,
  id: "item:test-cleared",
  tags: ["portable"],
  properties: { name: "Cleared", someField: undefined },
});
loadAiEntities(testGameId, store3);
store3.get("item:test-cleared").properties["name"]
=> Cleared
```

``` continue
cleanup();
```

## Remove entity

```
cleanup();
const store4 = makeStore();
saveAiEntity({
  createdAt: "2024-01-01T00:00:00Z",
  gameId: testGameId,
  id: "item:to-remove",
  tags: ["portable"],
  properties: { name: "Doomed" },
});
saveAiEntity({
  createdAt: "2024-01-01T00:00:00Z",
  gameId: testGameId,
  id: "item:to-keep",
  tags: ["portable"],
  properties: { name: "Keeper" },
});
removeAiEntity(testGameId, "item:to-remove");
loadAiEntities(testGameId, store4);
store4.has("item:to-remove")
=> false
```

``` continue
store4.has("item:to-keep")
=> true
```

``` continue
cleanup();
```
