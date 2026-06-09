import t from "tap";
import { withSessionLock } from "../src/server/session-lock.js";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

void t.test("commands for the same session run sequentially", async (t) => {
  const session = { gameId: "g", userId: "u" };
  const order: string[] = [];
  const gate = deferred();

  const first = withSessionLock(session, async () => {
    order.push("first-start");
    await gate.promise;
    order.push("first-end");
    return 1;
  });
  const second = withSessionLock(session, async () => {
    order.push("second-start");
    return 2;
  });

  // Give the second call a chance to (incorrectly) start early.
  await new Promise((r) => setImmediate(r));
  t.strictSame(order, ["first-start"], "second waits for first");

  gate.resolve();
  t.equal(await first, 1);
  t.equal(await second, 2);
  t.strictSame(order, ["first-start", "first-end", "second-start"]);
});

void t.test("different sessions do not block each other", async (t) => {
  const order: string[] = [];
  const gate = deferred();

  const slow = withSessionLock({ gameId: "g", userId: "u1" }, async () => {
    await gate.promise;
    order.push("slow");
  });
  const fast = withSessionLock({ gameId: "g", userId: "u2" }, async () => {
    order.push("fast");
  });

  await fast;
  t.strictSame(order, ["fast"], "other user's command ran immediately");
  gate.resolve();
  await slow;
});

void t.test("a failed command does not poison the queue", async (t) => {
  const session = { gameId: "g", userId: "u-fail" };

  await t.rejects(
    withSessionLock(session, async () => {
      throw new Error("boom");
    }),
    /boom/,
  );
  const result = await withSessionLock(session, async () => "recovered");
  t.equal(result, "recovered", "next command runs after a failure");
});
