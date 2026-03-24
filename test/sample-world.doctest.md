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
game.do("north");
game.room
=> room:deep-woods
```

``` continue
game.do("south");
game.room
=> room:clearing
```

Single-letter direction aliases work:

```
const g2 = testWorld();
g2.do("e");
g2.room
=> room:hillside
```

## Items

Take items and check inventory:

```
const g3 = testWorld();
g3.do("take lantern");
g3.inventory
=> [
  "Lantern"
]
```

Aliases work for items:

```
const g4 = testWorld();
g4.do("take lamp");
g4.locationOf("item:lantern")
=> player
```

## Locked Doors

The cabin door on the hillside is locked:

```
const g5 = testWorld();
g5.walk("e");
g5.do("enter");
g5.room
=> room:hillside
```

Unlock with the key and enter:

```
const g6 = testWorld();
g6.walk("take key", "e", "unlock door", "enter");
g6.room
=> room:cabin
```

## Visit Count

Rooms track how many times the player has entered:

```
const g7 = testWorld();
g7.walk("north");
g7.prop("room:deep-woods", "visits")
=> 1
```

``` continue
g7.walk("south", "north");
g7.prop("room:deep-woods", "visits")
=> 2
```
