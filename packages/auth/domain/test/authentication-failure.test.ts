import assert from "node:assert/strict";
import test from "node:test";
import { AuthenticationFailure, assertPasswordAccepted, evaluatePassword } from "../src/index.js";

test("authentication failures expose a stable domain code", () => {
  const failure = new AuthenticationFailure("SESSION_EXPIRED", "La sesión expiró.");
  assert.equal(failure.code, "SESSION_EXPIRED");
  assert.equal(failure.name, "AuthenticationFailure");
});

test("the password policy reports every unmet requirement", () => {
  const requirements = evaluatePassword("weak");
  assert.deepEqual(
    requirements.filter((requirement) => !requirement.satisfied).map((requirement) => requirement.code),
    ["minimum-length", "uppercase", "number", "special-character"],
  );
  assert.throws(() => assertPasswordAccepted("weak"), { code: "PASSWORD_POLICY_VIOLATION" });
  assert.doesNotThrow(() => assertPasswordAccepted("Strong!123"));
});
