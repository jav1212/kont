import assert from "node:assert/strict";
import test from "node:test";
import { EvaluateAccountAuthentication, SecureSignIn, type CredentialSecurityPolicyRepository } from "../../src/application";
import { InMemoryAccountSecurityRepository } from "../../src/testing";
import { AuthenticationFailure } from "../../src/domain";

const organizationId = "organization-1";
const userId = "user-1";
const policy = { passwordMaximumAgeDays: null, inactivityMaximumDays: null, failedAttemptLimit: 3, failedAttemptWindowMinutes: 15, lockoutMinutes: 15 };

test("secure sign-in uses the stored policy and clears a provider session when denied", async () => {
  let cleared = 0;
  const policies: CredentialSecurityPolicyRepository = { get: async () => ({ organizationId, policy, version: 1, updatedAt: "2026-09-01T00:00:00.000Z" }), update: async () => { throw new Error("not used"); } };
  const repository = new InMemoryAccountSecurityRepository([{ organizationId, userId, passwordChangedAt: "2026-09-01T00:00:00.000Z", lastAuthenticatedAt: "2026-09-01T00:00:00.000Z", failedAttempts: [], lockedUntil: "2026-09-30T00:00:00.000Z" }]);
  const service = new SecureSignIn(
    { signIn: async () => ({ identity: { userId, email: "ada@example.test" }, expiresAt: null }) },
    { clearSession: async () => { cleared += 1; } }, policies,
    new EvaluateAccountAuthentication(repository), { now: () => "2026-09-28T12:00:00.000Z" }, { resolve: async () => ({ userId }) },
  );
  await assert.rejects(() => service.execute({ organizationId, email: "ada@example.test", password: "provider-validated" }), { code: "ACCOUNT_SECURITY_DENIED" });
  assert.equal(cleared, 1);
});

test("invalid provider credentials record durable failures without account enumeration", async () => {
  const repository = new InMemoryAccountSecurityRepository([{ organizationId, userId, passwordChangedAt: "2026-09-01T00:00:00.000Z", lastAuthenticatedAt: "2026-09-20T00:00:00.000Z", failedAttempts: [], lockedUntil: null }]);
  const policies: CredentialSecurityPolicyRepository = { get: async () => ({ organizationId, policy: { ...policy, failedAttemptLimit: 2 }, version: 1, updatedAt: "2026-09-01T00:00:00.000Z" }), update: async () => { throw new Error("not used"); } };
  const service = new SecureSignIn({ signIn: async () => { throw new AuthenticationFailure("INVALID_CREDENTIALS", "incorrectas"); } }, { clearSession: async () => undefined }, policies, new EvaluateAccountAuthentication(repository), { now: () => "2026-09-28T12:00:00.000Z" }, { resolve: async () => ({ userId }) });
  await assert.rejects(() => service.execute({ organizationId, email: "ada@example.test", password: "wrong" }), { code: "INVALID_CREDENTIALS" });
  await assert.rejects(() => service.execute({ organizationId, email: "ada@example.test", password: "wrong" }), { code: "INVALID_CREDENTIALS" });
  assert.notEqual(repository.snapshot(organizationId, userId)?.lockedUntil, null);
});
