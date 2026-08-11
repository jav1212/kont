import assert from "node:assert/strict";
import test from "node:test";
import { AuthenticationFailure } from "../src/index.js";

test("authentication failures expose a stable domain code", () => {
  const failure = new AuthenticationFailure("SESSION_EXPIRED", "La sesión expiró.");
  assert.equal(failure.code, "SESSION_EXPIRED");
  assert.equal(failure.name, "AuthenticationFailure");
});
