# Scenery Aliases

```ts setup
import { EntityStore } from "../src/core/entity.js";
import { createRegistry } from "../src/core/properties.js";
import { defineBaseProperties } from "../src/core/base-properties.js";
import {
  getStoredScenery,
  isSceneryWord,
  isItemSceneryWord,
} from "../src/server/ai-scenery.js";
import type { SceneryEntry } from "../src/server/ai-scenery.js";

function makeStore(): EntityStore {
  const registry = createRegistry();
  defineBaseProperties(registry);
  return new EntityStore(registry, 1);
}
```

## SceneryEntry aliases in lookup

Scenery entries can have aliases that match in addition to the primary word:

```
const store = makeStore();
store.create("room:test", {
  tags: ["room"],
  name: "Test Room",
  description: "A test room.",
  scenery: [
    {
      word: "c-4",
      aliases: ["bay c-4", "bay 4", "manual revival"],
      description: "Bay C-4 shows a manual revival event dated 242 years ago.",
      rejection: "The display is behind glass.",
    },
  ],
});
const room = store.get("room:test");
```

Primary word matches:

``` continue
getStoredScenery(room, "c-4")
=> {
  "word": "c-4",
  "aliases": [
    "bay c-4",
    "bay 4",
    "manual revival"
  ],
  "description": "Bay C-4 shows a manual revival event dated 242 years ago.",
  "rejection": "The display is behind glass."
}
```

Aliases match too:

``` continue
getStoredScenery(room, "bay c-4") !== null
=> true
```

``` continue
getStoredScenery(room, "manual revival") !== null
=> true
```

Case insensitive:

``` continue
getStoredScenery(room, "BAY C-4") !== null
=> true
```

Non-matching word returns null:

``` continue
getStoredScenery(room, "something else")
=> null
```

## Item description scenery

Words in item descriptions can be treated as scenery when the item is visible:

```
const store2 = makeStore();
store2.create("room:bay", {
  tags: ["room"],
  name: "Hibernation Bay",
  description: "A chamber with pods.",
});
store2.create("item:suit", {
  tags: ["portable"],
  name: "Vapor Suit",
  location: "room:bay",
  description: "A jumpsuit with a hidden pocket in the lining near the hip.",
});
```

"pocket" appears in the suit's description, not the room's:

``` continue
isSceneryWord("pocket", store2.get("room:bay"))
=> false
```

But it should be findable via item descriptions. We use isItemSceneryWord:

``` continue
isItemSceneryWord("pocket", { store: store2, roomId: "room:bay", playerId: "player:1" })
=> {
  "word": "pocket",
  "entityId": "item:suit"
}
```

Words not in any item description return null:

``` continue
isItemSceneryWord("rocket", { store: store2, roomId: "room:bay", playerId: "player:1" })
=> null
```
