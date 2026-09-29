import assert from "node:assert/strict";
import { test } from "node:test";
import { DebouncedQuery, type QueryDelayScheduler } from "../../src/application/debounced-query";

class ManualScheduler implements QueryDelayScheduler {
  private next = 0;
  readonly callbacks = new Map<number, () => void>();
  schedule(callback: () => void): number {
    const id = ++this.next;
    this.callbacks.set(id, callback);
    return id;
  }
  cancel(handle: unknown): void { this.callbacks.delete(handle as number); }
  runAll(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    callbacks.forEach((callback) => callback());
  }
}

test("runs only the latest value after the debounce period", async () => {
  const scheduler = new ManualScheduler();
  const calls: string[] = [];
  const query = new DebouncedQuery<string, string>(
    (input) => { calls.push(input); return { result: Promise.resolve(input), cancel() {} }; },
    scheduler,
  );
  const old = query.schedule("old");
  const latest = query.schedule("latest");
  assert.deepEqual(await old, { status: "superseded" });
  scheduler.runAll();
  assert.deepEqual(await latest, { status: "completed", value: "latest" });
  assert.deepEqual(calls, ["latest"]);
});

test("cancels active transport and ignores stale resolution", async () => {
  const scheduler = new ManualScheduler();
  let resolveOld!: (value: string) => void;
  let cancelled = false;
  const query = new DebouncedQuery<string, string>(
    (input) => input === "old"
      ? { result: new Promise((resolve) => { resolveOld = resolve; }), cancel() { cancelled = true; } }
      : { result: Promise.resolve(input), cancel() {} },
    scheduler,
  );
  const old = query.schedule("old");
  scheduler.runAll();
  const latest = query.runImmediately("new");
  assert.equal(cancelled, true);
  resolveOld("stale");
  assert.deepEqual(await old, { status: "superseded" });
  assert.deepEqual(await latest, { status: "completed", value: "new" });
});

test("cancel settles pending work and validates delays", async () => {
  const query = new DebouncedQuery<string, string>(
    (input) => ({ result: Promise.resolve(input), cancel() {} }),
    new ManualScheduler(),
  );
  const pending = query.schedule("value");
  query.cancel();
  assert.deepEqual(await pending, { status: "superseded" });
  assert.throws(() => query.schedule("bad", Number.NaN), RangeError);
});
