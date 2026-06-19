import t from "tap";
import { safeHref } from "../src/web/HighlightedText.js";
import { canAccess } from "../src/server/router-agent.js";
import { debugAllowed } from "../src/server/execute-command.js";
import { EntityStore } from "../src/core/entity.js";
import { createRegistry } from "../src/core/properties.js";
import { HandlerLib } from "../src/core/handler-lib.js";
import { handlerDataToHandler } from "../src/core/handler-eval.js";
import type { VerbContext } from "../src/core/verb-types.js";

t.test("#4 safeHref rejects dangerous schemes, allows same-origin + https", (t) => {
  t.equal(safeHref("javascript:alert(1)"), null, "javascript: rejected");
  t.equal(safeHref("  javascript:alert(1)"), null, "leading-space javascript: rejected");
  t.equal(safeHref("data:text/html,<script>"), null, "data: rejected");
  t.equal(safeHref("vbscript:msgbox"), null, "vbscript: rejected");
  t.equal(safeHref("//evil.example"), null, "protocol-relative rejected");
  t.equal(safeHref("/game/x"), "/game/x", "same-origin relative allowed");
  t.equal(safeHref("https://example.com/x"), "https://example.com/x", "https allowed");
  t.equal(safeHref("http://example.com"), "http://example.com", "http allowed");
  t.end();
});

t.test("#1 canAccess: owner or admin only", (t) => {
  const session = { userId: "u1" } as Parameters<typeof canAccess>[0];
  t.equal(canAccess(session, { userId: "u1", roles: ["ai"] }), true, "owner");
  t.equal(canAccess(session, { userId: "u2", roles: ["admin"] }), true, "admin");
  t.equal(canAccess(session, { userId: "u2", roles: ["ai"] }), false, "other ai user denied");
  t.end();
});

t.test("#2 debugAllowed only for debug-role callers", (t) => {
  t.equal(debugAllowed({ gameId: "g", userId: "u", text: "", debug: true, roles: ["debug"] }), true, "debug role + flag");
  t.equal(debugAllowed({ gameId: "g", userId: "u", text: "", debug: true, roles: ["player", "ai"] }), false, "no debug role");
  t.equal(debugAllowed({ gameId: "g", userId: "u", text: "", debug: false, roles: ["debug"] }), false, "no flag");
  t.equal(debugAllowed({ gameId: "g", userId: "u", text: "", debug: true }), false, "no roles");
  t.end();
});

t.test("#3 handler scope + lib returns redact secret/ai", async (t) => {
  const store = new EntityStore(createRegistry(), 1);
  store.create("world:root", { tags: [], name: "World", description: "", location: "" });
  store.create("room:r", { tags: ["room"], name: "R", description: "A room.", location: "world:root" });
  store.create("player:1", { tags: ["player"], name: "You", description: "", location: "room:r" });
  store.create("item:gem", {
    tags: [],
    name: "gem",
    description: "shiny",
    location: "room:r",
    secret: "the gem is a forgery",
    ai: { prompt: "designer-only prompt" },
  });
  const context: VerbContext = {
    store,
    command: { form: "transitive", verb: "examine", object: store.get("item:gem") },
    player: store.get("player:1"),
    room: store.get("room:r"),
  };

  // Scope snapshot: object.secret / object.ai must be gone.
  const scopeProbe = handlerDataToHandler(
    {
      name: "probe-scope",
      pattern: { verb: "probe", form: "transitive" },
      perform: "return { output: [typeof object.secret, typeof object.ai].join(','), events: [] };",
    },
    { libFactory: (c) => new HandlerLib(c) },
  );
  const r1 = await scopeProbe.perform(context);
  t.equal(r1.output, "undefined,undefined", "secret/ai stripped from scope snapshot");

  // lib return: contents() entities must also be redacted.
  const libProbe = handlerDataToHandler(
    {
      name: "probe-lib",
      pattern: { verb: "probe", form: "transitive" },
      perform:
        "const items = await lib.contents(room.id); const gem = items.find(e => e.id === 'item:gem'); return { output: typeof (gem && gem.secret), events: [] };",
    },
    { libFactory: (c) => new HandlerLib(c) },
  );
  const r2 = await libProbe.perform(context);
  t.equal(r2.output, "undefined", "secret stripped from lib.contents() return");
});
