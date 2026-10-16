import assert from "node:assert/strict";
import test from "node:test";
import {
  credentialSecurityPolicy,
  evaluateAuthenticationAttempt,
  type AccountSecurityState,
} from "../../src/domain";

const POLICY = credentialSecurityPolicy({
  passwordMaximumAgeDays: 90,
  inactivityMaximumDays: 30,
  failedAttemptLimit: 3,
  failedAttemptWindowMinutes: 15,
  lockoutMinutes: 20,
});
const NOW = "2026-09-28T12:00:00.000Z";
function state(
  overrides: Partial<AccountSecurityState> = {},
): AccountSecurityState {
  return {
    organizationId: "organization-1",
    userId: "user-1",
    passwordChangedAt: "2026-09-01T12:00:00.000Z",
    lastAuthenticatedAt: "2026-09-20T12:00:00.000Z",
    failedAttempts: [],
    lockedUntil: null,
    ...overrides,
  };
}

test("locks an account after the configured consecutive failures", () => {
  const first = evaluateAuthenticationAttempt(state(), POLICY, NOW, false);
  const second = evaluateAuthenticationAttempt(
    first.state,
    POLICY,
    "2026-09-28T12:01:00.000Z",
    false,
  );
  const third = evaluateAuthenticationAttempt(
    second.state,
    POLICY,
    "2026-09-28T12:02:00.000Z",
    false,
  );
  assert.equal(third.reason, "invalid_credentials");
  assert.equal(third.state.lockedUntil, "2026-09-28T12:22:00.000Z");
  assert.equal(
    evaluateAuthenticationAttempt(
      third.state,
      POLICY,
      "2026-09-28T12:03:00.000Z",
      true,
    ).reason,
    "locked",
  );
});

test("expired attempts do not count and an expired lock permits valid credentials", () => {
  const result = evaluateAuthenticationAttempt(
    state({ failedAttempts: ["2026-09-28T11:00:00.000Z"], lockedUntil: NOW }),
    POLICY,
    NOW,
    true,
  );
  assert.equal(result.allowed, true);
  assert.equal(result.state.lockedUntil, null);
  assert.equal(
    evaluateAuthenticationAttempt(
      state({ failedAttempts: ["2026-09-28T11:00:00.000Z"] }),
      POLICY,
      NOW,
      false,
    ).state.failedAttempts.length,
    1,
  );
});

test("future account facts and unrepresentable lock durations fail with typed input errors", () => {
  assert.throws(
    () =>
      evaluateAuthenticationAttempt(
        state({ failedAttempts: ["2026-09-29T12:00:00.000Z"] }),
        POLICY,
        NOW,
        false,
      ),
    { code: "INVALID_INPUT" },
  );
  assert.throws(
    () =>
      evaluateAuthenticationAttempt(
        state(),
        {
          ...POLICY,
          failedAttemptLimit: 1,
          lockoutMinutes: Number.MAX_SAFE_INTEGER,
        },
        NOW,
        false,
      ),
    { code: "INVALID_INPUT" },
  );
});

test("rejects expired passwords and inactive users before accepting credentials", () => {
  assert.equal(
    evaluateAuthenticationAttempt(
      state({ passwordChangedAt: "2026-06-01T12:00:00.000Z" }),
      POLICY,
      NOW,
      true,
    ).reason,
    "password_expired",
  );
  assert.equal(
    evaluateAuthenticationAttempt(
      state({ lastAuthenticatedAt: "2026-08-01T12:00:00.000Z" }),
      POLICY,
      NOW,
      true,
    ).reason,
    "inactive",
  );
});

test("successful sign in clears failures and updates activity", () => {
  const result = evaluateAuthenticationAttempt(
    state({ failedAttempts: ["2026-09-28T11:58:00.000Z"] }),
    POLICY,
    NOW,
    true,
  );
  assert.equal(result.allowed, true);
  assert.deepEqual(result.state.failedAttempts, []);
  assert.equal(result.state.lastAuthenticatedAt, NOW);
});
