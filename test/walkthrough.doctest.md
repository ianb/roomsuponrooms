# Colossal Cave Walkthrough Test

A partial walkthrough testing the major puzzle paths and treasure collection.

```ts setup
import { colossalCave } from "./helpers.js";
```

## Phase 1: Supplies and Enter Cave

```
const game = colossalCave();
await game.walk("west");
await game.do("take keys");
await game.do("take lamp");
await game.do("take food");
await game.do("take bottle");
await game.do("turn lamp");
await game.walk("east", "south", "south", "south");
await game.do("unlock grate");
await game.walk("down", "west");
await game.do("take cage");
game.roomName
=> In Cobble Crawl
```

## Phase 2: Bird and Snake

Navigate to bird chamber, catch bird:

``` continue
await game.walk("west", "west", "west");
await game.do("take bird");
game.locationOf("item:bird")
=> item:cage
```

Navigate to Hall of Mountain King (west, down through small pit, down through hall of mists):

``` continue
await game.walk("west", "down", "down");
game.roomName
=> Hall of the Mountain King
```

Release bird to drive away snake:

``` continue
await game.do("release bird");
game.locationOf("item:snake")
=> void
```

## Phase 3: Collect Mountain King Area Treasures

Jewelry from the south side chamber:

``` continue
await game.do("south");
await game.do("take jewelry");
game.locationOf("item:jewelry")
=> player:1
```

Go back to Mt King then east to Hall of Mists for the nugget:

``` continue
await game.do("north");
await game.do("east");
await game.do("south");
game.roomName
=> Low Room
```

``` continue
await game.do("take nugget");
game.locationOf("item:nugget")
=> player:1
```

## Phase 4: Return via PLUGH and deposit

Navigate: nugget room → hall of mists → mt king → low N/S → Y2:

``` continue
await game.walk("north", "down", "north", "north");
game.roomName
=> At 'Y2'
```

``` continue
await game.do("plugh");
await game.do("drop nugget");
await game.do("drop jewelry");
game.score > 36
=> true
```

## Phase 6: Crystal Bridge

Go back for the rod and create the bridge:

``` continue
await game.do("xyzzy");
await game.do("take rod");
await game.do("xyzzy");
game.roomName
=> Inside Building
```

Navigate to fissure: plugh → Y2, south → low N/S, south → mt king,
east → hall of mists, west → fissure:

``` continue
await game.do("plugh");
await game.walk("south", "south", "east", "west");
game.roomName
=> On East Bank of Fissure
```

Wave rod to create bridge and cross:

``` continue
await game.do("wave rod");
await game.do("west");
game.roomName
=> West Side of Fissure
```

Get diamonds (they are here on the west side of the fissure):

``` continue
await game.do("take diamonds");
game.locationOf("item:diamonds")
=> player:1
```

Return to building: west side → west end of hall → east end → crossover → low N/S → Y2 → plugh.
Actually, simpler: east back across bridge, then south to mt king, north to low N/S, north to Y2:

``` continue
await game.walk("east", "east", "down", "north", "north");
await game.do("plugh");
await game.do("drop diamonds");
await game.do("drop rod");
game.roomName
=> Inside Building
```
