# Sample World

```ts setup
import { testWorld } from "./helpers.js";
```

## Movement

The player starts in the Forest Clearing:

```
const game = testWorld();
game.room
=> room:clearing
```

Moving north goes to Deep Woods, south returns:

``` continue
await game.do("north");
game.room
=> room:deep-woods
```

``` continue
await game.do("south");
game.room
=> room:clearing
```

Single-letter direction aliases work:

```
const g2 = testWorld();
await g2.do("e");
g2.room
=> room:hillside
```

## Items

Take items and check inventory:

```
const g3 = testWorld();
await g3.do("take lantern");
g3.inventory
=> [
  "Lantern"
]
```

Aliases work for items:

```
const g4 = testWorld();
await g4.do("take lamp");
g4.locationOf("item:lantern")
=> player:1
```

## Locked Doors

The cabin door on the hillside is locked:

```
const g5 = testWorld();
await g5.walk("e");
await g5.do("enter");
g5.room
=> room:hillside
```

Unlock with the key and enter:

```
const g6 = testWorld();
await g6.walk("take key", "e", "unlock door", "enter");
g6.room
=> room:cabin
```

## Visit Count

Rooms track how many times the player has entered:

```
const g7 = testWorld();
await g7.walk("north");
g7.runner.store.get("room:deep-woods").room.visits
=> 1
```

``` continue
await g7.walk("south", "north");
g7.runner.store.get("room:deep-woods").room.visits
=> 2
```

## Entity ID Validation

Entity IDs must follow the `type:name` pattern — bare IDs without a colon are rejected:

```
const g8 = testWorld();
g8.runner.store.create("badid", { tags: [] })
=> throws InvalidEntityIdError
```

The full error message can also be checked:

``` continue
g8.runner.store.create("also-bad", { tags: [] })
=> throws InvalidEntityIdError: Entity ID "also-bad" must contain a colon (e.g. "type:name")
```
