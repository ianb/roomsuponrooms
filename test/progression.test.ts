import t from "tap";
import "../src/games/tinkermarket/index.js";
import { getGame } from "../src/games/registry.js";
import { createGameRunner } from "../src/core/index.js";
import { describeRoomFull } from "../src/core/index.js";
import {
  meterValue,
  gateState,
  tierIndex,
  tierCrossings,
  describeStatus,
  type Track,
} from "../src/core/progression.js";
import type { EntityStore } from "../src/core/entity.js";

const CRAFT_TRACK: Track = {
  name: "craft",
  label: "Craft",
  signpostNext: true,
  tiers: [
    { name: "an Apprentice", at: 0 },
    { name: "a Journeyman", at: 2, announce: "*** journeyman ***" },
    { name: "a Master", at: 4, announce: "*** master ***" },
  ],
};

function tinkermarket(): { store: EntityStore } {
  const def = getGame("tinkermarket");
  if (!def) throw new Error("tinkermarket not registered");
  return def.create();
}

t.test("tierIndex maps meter values to the highest reached tier", (t) => {
  t.equal(tierIndex(CRAFT_TRACK, 0), 0, "0 -> Apprentice");
  t.equal(tierIndex(CRAFT_TRACK, 1), 0, "1 -> still Apprentice");
  t.equal(tierIndex(CRAFT_TRACK, 2), 1, "2 -> Journeyman");
  t.equal(tierIndex(CRAFT_TRACK, 5), 2, "5 -> Master");
  t.equal(tierIndex({ name: "coin", label: "Coin" }, 99), -1, "tierless track has no tier");
  t.end();
});

t.test("tierCrossings announces every tier crossed by a command", (t) => {
  const { store } = tinkermarket();
  store.setProperty("player:1", { name: "craft", value: 4 });
  const before = new Map([["craft", 0]]);
  const lines = tierCrossings(store, { tracks: [CRAFT_TRACK], before, playerId: "player:1" });
  t.same(lines, ["*** journeyman ***", "*** master ***"], "both tiers fire on a big jump");

  const before2 = new Map([["craft", 2]]);
  const none = tierCrossings(store, { tracks: [CRAFT_TRACK], before: before2, playerId: "player:1" });
  t.same(none, ["*** master ***"], "only the newly-crossed tier fires");
  t.end();
});

t.test("describeStatus shows declared tracks, tier, and signposted next", (t) => {
  const { store } = tinkermarket();
  const tracks: Track[] = [{ name: "coin", label: "Coin" }, CRAFT_TRACK];
  const text = describeStatus(store, { tracks, playerId: "player:1" });
  t.match(text, /Coin: 12/, "shows the coin meter value");
  t.match(text, /Craft: an Apprentice/, "shows current craft tier");
  t.match(text, /a Journeyman at 2/, "signposts the next tier requirement");
  t.end();
});

t.test("gateState reads gate properties off an entity", (t) => {
  const { store } = tinkermarket();
  const exit = store.get("exit:rawstock-row:east");
  const player = store.get("player:1");
  t.equal(gateState(exit, player).passes, false, "apprentice cannot pass the crush gate");
  t.equal(gateState(exit, player).hidden, false, "the crush gate is a visible signpost");
  store.setProperty("player:1", { name: "craft", value: 2 });
  t.equal(gateState(exit, store.get("player:1")).passes, true, "journeyman passes");
  t.equal(meterValue(store.get("player:1"), "craft"), 2, "meterValue reads the property");
  t.end();
});

t.test("a signposted exit gate blocks then opens with the meter", (t) => {
  const runner = createGameRunner(tinkermarket());
  runner.store.setProperty("player:1", { name: "location", value: "room:rawstock-row" });

  const blocked = runner.command("go east");
  t.match(blocked, /apprentice/, "blocked with the in-character signpost");
  t.equal(runner.currentRoom(), "room:rawstock-row", "did not move");

  runner.store.setProperty("player:1", { name: "craft", value: 2 });
  runner.command("go east");
  t.equal(runner.currentRoom(), "room:the-crush", "journeyman walks into the crush");
  t.end();
});

t.test("a hidden gate keeps an entity out of listings until met", (t) => {
  const { store } = tinkermarket();
  store.setProperty("player:1", { name: "location", value: "room:squatters-corner" });

  const apprenticeView = describeRoomFull(store, {
    room: store.get("room:squatters-corner"),
    playerId: "player:1",
  });
  t.notMatch(apprenticeView, /Maker's Seal/, "hidden from an apprentice");

  store.setProperty("player:1", { name: "craft", value: 4 });
  const masterView = describeRoomFull(store, {
    room: store.get("room:squatters-corner"),
    playerId: "player:1",
  });
  t.match(masterView, /Maker's Seal/, "revealed to a master");
  t.end();
});

t.test("crafting awards the craft meter and fires the tier ceremony", (t) => {
  const runner = createGameRunner(tinkermarket());
  // Hand the player the two ingredients for the first recipe.
  runner.store.setProperty("item:shimmerite-dust", { name: "location", value: "player:1" });
  runner.store.setProperty("item:sealed-clay", { name: "location", value: "player:1" });
  const out1 = runner.command("combine shimmerite dust with sealed clay");
  t.match(out1, /glittering brick/, "first recipe succeeds");
  t.equal(runner.getProperty("player:1", "craft"), 1, "craft meter rose to 1");
  t.notMatch(out1, /Journeyman/, "no tier-up yet at craft 1");

  // Second recipe takes craft to 2 — Journeyman.
  runner.store.setProperty("item:coppervine-wire", { name: "location", value: "player:1" });
  runner.store.setProperty("item:void-glass-shard", { name: "location", value: "player:1" });
  const out2 = runner.command("combine coppervine wire with void glass shard");
  t.equal(runner.getProperty("player:1", "craft"), 2, "craft meter rose to 2");
  t.match(out2, /Journeyman/, "tier ceremony fired on crossing");
  t.end();
});

t.test("the status command reports standing in real play", (t) => {
  const runner = createGameRunner(tinkermarket());
  const out = runner.command("status");
  t.match(out, /Coin: 12/, "status lists coin");
  t.match(out, /Craft: an Apprentice/, "status lists craft tier");
  t.end();
});
