import t from "tap";
import { EntityStore } from "../src/core/entity.js";
import { createRegistry } from "../src/core/properties.js";
import { evaluateWordPerform } from "../src/core/conversation-eval.js";
import type { WordEntry, ConversationState } from "../src/core/conversation.js";

function world() {
  const store = new EntityStore(createRegistry(), 1);
  store.create("world:root", { tags: [], name: "World", description: "", location: "" });
  store.create("room:hall", { tags: ["room"], name: "Hall", description: "A hall.", location: "world:root" });
  store.create("player:1", { tags: ["player"], name: "You", description: "", location: "room:hall" });
  store.create("npc:guide", {
    tags: ["talkable"],
    name: "Guide",
    description: "A guide.",
    location: "room:hall",
    secret: "the guide is lying",
    ai: { prompt: "designer-only" },
  });
  return store;
}

function state(): ConversationState {
  return {
    currentWord: "hello",
    seenWords: new Set(["hello"]),
    knownWords: new Set(),
  } as unknown as ConversationState;
}

t.test("conversation perform runs in the sandbox (scope + return)", async (t) => {
  const store = world();
  const entry: WordEntry = {
    word: "hello",
    perform:
      "return { allowed: true, response: 'You said ' + word + ' (' + state.seenWords.length + ' seen) to ' + npc.name };",
  } as WordEntry;
  const result = await evaluateWordPerform(entry, {
    npc: store.get("npc:guide"),
    player: store.get("player:1"),
    room: store.get("room:hall"),
    store,
    word: "hello",
    state: state(),
  });
  t.match(result, { allowed: true, response: "You said hello (1 seen) to Guide" }, "scope wired through sandbox");
});

t.test("conversation perform cannot read designer-only npc.secret/ai", async (t) => {
  const store = world();
  const entry: WordEntry = {
    word: "hello",
    perform: "return { allowed: true, response: [typeof npc.secret, typeof npc.ai].join(',') };",
  } as WordEntry;
  const result = await evaluateWordPerform(entry, {
    npc: store.get("npc:guide"),
    player: store.get("player:1"),
    room: store.get("room:hall"),
    store,
    word: "hello",
    state: state(),
  });
  t.match(result, { response: "undefined,undefined" }, "secret/ai redacted in conversation scope");
});
