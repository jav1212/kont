import assert from "node:assert/strict";
import test from "node:test";
import { limit, money } from "../src/index.js";

test("usage limits never expose a negative remaining value", () => {
  assert.deepEqual(limit(5, 3), { used: 5, maximum: 3, remaining: 0 });
});

test("money rejects negative amounts", () => {
  assert.throws(() => money(BigInt(-1), "USD"), TypeError);
});
