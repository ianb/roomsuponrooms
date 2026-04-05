# Game Lint

Verify all registered games can be instantiated without errors.

```ts setup
import "../src/games/test-world.js";
import "../src/games/colossal-cave/index.js";
import "../src/games/the-aaru/index.js";
import "../src/games/tinkermarket/index.js";
import { getGame } from "../src/games/registry.js";

function createGame(slug) {
  const def = getGame(slug);
  return def.create();
}

function lintExits(slug) {
  const instance = createGame(slug);
  const exits = instance.store.findByTag("exit");
  const problems = [];
  for (const exit of exits) {
    if (!exit.exit) { problems.push(`${exit.id}: no exit data`); continue; }
    const dest = exit.exit.destination;
    const intent = exit.exit.destinationIntent;
    if (!dest && !intent) problems.push(`${exit.id}: no destination or intent`);
    if (dest && !instance.store.has(dest)) problems.push(`${exit.id}: destination ${dest} not found`);
  }
  return problems.length === 0 ? "ok" : problems.join("; ");
}

function lintLocations(slug) {
  const instance = createGame(slug);
  const ids = instance.store.getAllIds();
  const problems = [];
  for (const id of ids) {
    const entity = instance.store.get(id);
    const loc = entity.location;
    if (loc === "void" || loc === "world") continue;
    if (!instance.store.has(loc)) problems.push(`${id}: location ${loc} not found`);
  }
  return problems.length === 0 ? "ok" : problems.join("; ");
}
```

## Test World loads

```
const tw = createGame("test");
tw.store.findByTag("room").length > 0
=> true
```

## Colossal Cave loads

```
const cc = createGame("colossal-cave");
cc.store.findByTag("room").length > 0
=> true
```

## The Aaru loads

```
const aa = createGame("the-aaru");
aa.store.findByTag("room").length > 0
=> true
```

## Tinkermarket loads

```
const tm = createGame("tinkermarket");
tm.store.findByTag("room").length > 0
=> true
```

## Test World exits valid

```
lintExits("test")
=> ok
```

## The Aaru exits valid

```
lintExits("the-aaru")
=> ok
```

## Tinkermarket exits valid

```
lintExits("tinkermarket")
=> ok
```

## Test World locations valid

```
lintLocations("test")
=> ok
```

## The Aaru locations valid

```
lintLocations("the-aaru")
=> ok
```

## Tinkermarket locations valid

```
lintLocations("tinkermarket")
=> ok
```
