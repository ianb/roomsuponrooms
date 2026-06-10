import t from "tap";
import { EntityStore } from "../src/core/entity.js";
import { resolveRoomTexture, describeTexture } from "../src/core/room-texture.js";

function makeWorld(roomCount: number): EntityStore {
  const store = new EntityStore();
  for (let i = 0; i < roomCount; i++) {
    store.create(`room:syn-${i}`, {
      tags: ["room"],
      name: `Room ${i}`,
      description: "A room.",
      location: "world",
    });
  }
  for (let i = 0; i < roomCount; i++) {
    const next = (i + 1) % roomCount;
    store.create(`exit:syn-${i}:east`, {
      tags: ["exit"],
      name: "East",
      description: "East.",
      location: `room:syn-${i}`,
      exit: { direction: "east", destination: `room:syn-${next}` },
    });
    store.create(`exit:syn-${next}:west`, {
      tags: ["exit"],
      name: "West",
      description: "West.",
      location: `room:syn-${next}`,
      exit: { direction: "west", destination: `room:syn-${i}` },
    });
  }
  return store;
}

void t.test("explicit texture always wins", async (t) => {
  const store = makeWorld(3);
  store.create("room:authored", {
    tags: ["room"],
    name: "Authored",
    description: "x",
    location: "world",
    room: { texture: "rich" },
  });
  t.equal(resolveRoomTexture(store, "room:authored"), "rich");
});

void t.test("derivation is deterministic", async (t) => {
  const a = makeWorld(20);
  const b = makeWorld(20);
  for (let i = 0; i < 20; i++) {
    t.equal(
      resolveRoomTexture(a, `room:syn-${i}`),
      resolveRoomTexture(b, `room:syn-${i}`),
      `room ${i} stable across store rebuilds`,
    );
  }
});

void t.test("distribution: all three textures present, rich is the rarest", async (t) => {
  const store = makeWorld(200);
  const counts = { sparse: 0, plain: 0, rich: 0 };
  for (let i = 0; i < 200; i++) counts[resolveRoomTexture(store, `room:syn-${i}`)] += 1;
  t.ok(counts.sparse >= 40, `sparse well represented (${counts.sparse})`);
  t.ok(counts.plain >= 40, `plain well represented (${counts.plain})`);
  t.ok(counts.rich >= 8, `rich present (${counts.rich})`);
  t.ok(counts.rich < counts.sparse && counts.rich < counts.plain, "rich is the rarest");
});

void t.test("neighbors agree more often than chance (spatial coherence)", async (t) => {
  const store = makeWorld(200);
  const tex: string[] = [];
  for (let i = 0; i < 200; i++) tex.push(resolveRoomTexture(store, `room:syn-${i}`));
  let neighborSame = 0;
  for (let i = 0; i < 200; i++) if (tex[i] === tex[(i + 1) % 200]) neighborSame += 1;
  const counts = { sparse: 0, plain: 0, rich: 0 };
  for (const x of tex) counts[x as keyof typeof counts] += 1;
  const randomAgree =
    (counts.sparse / 200) ** 2 + (counts.plain / 200) ** 2 + (counts.rich / 200) ** 2;
  t.ok(
    neighborSame / 200 > randomAgree + 0.05,
    `neighbor agreement ${(neighborSame / 200).toFixed(2)} beats chance ${randomAgree.toFixed(2)}`,
  );
});

void t.test("NPC rooms are never sparse", async (t) => {
  const store = makeWorld(50);
  for (let i = 0; i < 50; i++) {
    store.create(`npc:syn-${i}`, {
      tags: ["npc", "talkable"],
      name: `Keeper ${i}`,
      description: "x",
      location: `room:syn-${i}`,
    });
  }
  for (let i = 0; i < 50; i++) {
    t.not(resolveRoomTexture(store, `room:syn-${i}`), "sparse", `staffed room ${i} not sparse`);
  }
});

void t.test("describeTexture covers all values", async (t) => {
  t.match(describeTexture("sparse"), /SPARSE/);
  t.match(describeTexture("plain"), /PLAIN/);
  t.match(describeTexture("rich"), /RICH/);
});
