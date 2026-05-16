import t from "tap";
import { EntityStore } from "../src/core/entity.js";
import { resolveCommand } from "../src/core/resolve.js";
import type { ParsedCommand } from "../src/core/verb-types.js";

interface ExtraEntity {
  id: string;
  tags?: string[];
  name?: string;
  description?: string;
  location?: string;
  aliases?: string[];
}

/**
 * Stand up a tiny store with a player in a room and any extra entities the
 * caller passes in. Avoids loading a real game definition.
 */
function makeStore(extras: ExtraEntity[]): EntityStore {
  const store = new EntityStore();
  store.create("world:root", {
    tags: [],
    name: "World",
    description: "",
    location: "",
  });
  store.create("room:clearing", {
    tags: ["room"],
    name: "Clearing",
    description: "A test clearing.",
    location: "world:root",
  });
  store.create("player:1", {
    tags: ["player"],
    name: "You",
    description: "",
    location: "room:clearing",
  });
  for (const e of extras) {
    const { id, ...rest } = e;
    store.create(id, {
      tags: rest.tags || [],
      name: rest.name || id,
      description: rest.description || "",
      location: rest.location || "room:clearing",
      aliases: rest.aliases,
    });
  }
  return store;
}

function transitive(verb: string, object: string): ParsedCommand {
  return { form: "transitive", verb, object };
}

t.test("resolveCommand: word-boundary match in a multi-word name", (t) => {
  const store = makeStore([
    {
      id: "item:rusty-lever",
      tags: ["portable"],
      name: "rusty lever",
      description: "",
      location: "room:clearing",
    },
  ]);
  const result = resolveCommand(transitive("take", "lever"), {
    store,
    roomId: "room:clearing",
    playerId: "player:1",
  });
  if (typeof result === "string") {
    t.fail(`expected entity, got string: ${result}`);
    return t.end();
  }
  if (result.form !== "transitive") {
    t.fail(`expected transitive, got ${result.form}`);
    return t.end();
  }
  t.equal(result.object.id, "item:rusty-lever");
  t.end();
});

t.test("resolveCommand: ambiguous when alias clashes with another entity's word", (t) => {
  // The classic agent-introduced bug: an exact alias on one entity (junk-pile)
  // shadows a word-in-name match on the actual entity (rusty lever). This used
  // to silently pick junk-pile; we now want it surfaced as ambiguous.
  const store = makeStore([
    {
      id: "item:rusty-lever",
      tags: ["portable"],
      name: "rusty lever",
      description: "",
      location: "room:clearing",
    },
    {
      id: "item:junk-pile",
      tags: ["fixed-display"],
      name: "heap of junk",
      description: "",
      location: "room:clearing",
      aliases: ["lever"],
    },
  ]);
  const result = resolveCommand(transitive("take", "lever"), {
    store,
    roomId: "room:clearing",
    playerId: "player:1",
  });
  t.type(result, "string", "ambiguous resolution returns a player-facing string");
  if (typeof result === "string") {
    t.match(result, /Which "lever"/, "string explains the ambiguity");
    t.match(result, /rusty lever/);
    t.match(result, /heap of junk/);
  }
  t.end();
});

t.test("resolveCommand: internal-id substring does NOT block a real alias match", (t) => {
  // Exits in some games use the entity id as the name, e.g.
  // "exit:outside-grate:north". The substring "grate" appears inside that
  // name but not as a whitespace-bounded word, so it must NOT compete with
  // the real "grate" alias on the door entity. This is the regression that
  // killed the colossal-cave walkthrough during development.
  const store = makeStore([
    {
      id: "door:grate:down",
      tags: ["openable", "door"],
      name: "Steel Grate",
      description: "",
      location: "room:clearing",
      aliases: ["grate"],
    },
    {
      id: "exit:outside-grate:north",
      tags: ["exit"],
      name: "exit:outside-grate:north",
      description: "",
      location: "room:clearing",
    },
  ]);
  const result = resolveCommand(transitive("unlock", "grate"), {
    store,
    roomId: "room:clearing",
    playerId: "player:1",
  });
  if (typeof result === "string") {
    t.fail(`expected entity, got string: ${result}`);
    return t.end();
  }
  if (result.form !== "transitive") {
    t.fail(`expected transitive, got ${result.form}`);
    return t.end();
  }
  t.equal(result.object.id, "door:grate:down");
  t.end();
});

t.test("resolveCommand: two whitespace-bounded matches are ambiguous", (t) => {
  const store = makeStore([
    {
      id: "item:rusty-key",
      tags: ["portable"],
      name: "rusty key",
      description: "",
      location: "room:clearing",
    },
    {
      id: "item:brass-key",
      tags: ["portable"],
      name: "brass key",
      description: "",
      location: "room:clearing",
    },
  ]);
  const result = resolveCommand(transitive("take", "key"), {
    store,
    roomId: "room:clearing",
    playerId: "player:1",
  });
  t.type(result, "string");
  if (typeof result === "string") {
    t.match(result, /Which "key"/);
    t.match(result, /rusty key/);
    t.match(result, /brass key/);
  }
  t.end();
});

t.test("resolveCommand: held entity wins disambiguation only when both are exact", (t) => {
  // preferHeld is allowed to break ties — but only when every candidate has
  // the input as a fully exact name/alias. Word-boundary matches don't get
  // the courtesy.
  const store = makeStore([
    {
      id: "item:lantern-held",
      tags: ["portable"],
      name: "lantern",
      description: "",
      location: "player:1",
    },
    {
      id: "item:lantern-other",
      tags: ["portable"],
      name: "lantern",
      description: "",
      location: "room:clearing",
    },
  ]);
  const result = resolveCommand(transitive("examine", "lantern"), {
    store,
    roomId: "room:clearing",
    playerId: "player:1",
  });
  if (typeof result === "string") {
    t.fail(`expected entity, got string: ${result}`);
    return t.end();
  }
  if (result.form !== "transitive") {
    t.fail(`expected transitive, got ${result.form}`);
    return t.end();
  }
  t.equal(result.object.id, "item:lantern-held");
  t.end();
});
