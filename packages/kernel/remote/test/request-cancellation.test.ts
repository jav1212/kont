import assert from "node:assert/strict";
import test from "node:test";
import { createRequestCancellation } from "../src/index";

test("propagates cancellation from an already-aborted source", () => {
  const source = new AbortController();
  source.abort("session ended");

  const request = createRequestCancellation(source.signal, 100);

  assert.equal(request.signal.aborted, true);
  assert.equal(request.signal.reason, "session ended");
  request.dispose();
});

test("propagates cancellation while the request is active", () => {
  const source = new AbortController();
  const request = createRequestCancellation(source.signal, 100);

  source.abort("workspace changed");

  assert.equal(request.signal.aborted, true);
  assert.equal(request.signal.reason, "workspace changed");
  request.dispose();
});

test("aborts when the request timeout expires", async () => {
  const request = createRequestCancellation(new AbortController().signal, 5);
  await new Promise((resolve) => setTimeout(resolve, 15));

  assert.equal(request.signal.aborted, true);
  assert.equal(request.signal.reason.name, "TimeoutError");
  request.dispose();
});

test("dispose is idempotent and clears a pending timeout", async () => {
  const request = createRequestCancellation(new AbortController().signal, 10);
  request.dispose();
  request.dispose();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(request.signal.aborted, false);
});

test("rejects invalid timeout values", () => {
  for (const timeout of [0, -1, Number.NaN, Number.POSITIVE_INFINITY)
    assert.throws(
      () => createRequestCancellation(new AbortController().signal, timeout),
      RangeError,
    );
});
