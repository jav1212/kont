import assert from "node:assert/strict";
import test from "node:test";
import {
  EvaluateAccountAuthentication,
  FederatedRedirectPolicy,
  StartFederatedSignIn,
  type AccountSecurityRepository,
  type FederatedSignInPort,
} from "../../src/application";
import type { AccountSecurityState } from "../../src/domain";
import { InMemoryAccountSecurityRepository } from "../../src/testing";

const state: AccountSecurityState = {
  organizationId: "organization-1",
  userId: "user-1",
  passwordChangedAt: "2026-09-01T00:00:00.000Z",
  lastAuthenticatedAt: "2026-09-20T00:00:00.000Z",
  failedAttempts: [],
  lockedUntil: null,
};
const policy = {
  passwordMaximumAgeDays: null,
  inactivityMaximumDays: null,
  failedAttemptLimit: 2,
  failedAttemptWindowMinutes: 10,
  lockoutMinutes: 10,
};
test("account authentication persists every failed-attempt decision", async () => {
  let committed: AccountSecurityState | undefined;
  const repository: AccountSecurityRepository = {
    transact: async (_scope, operation) => {
      const next = operation(state);
      committed = next.state;
      return next.result;
    },
  };
  const result = await new EvaluateAccountAuthentication(repository).execute({
    organizationId: "organization-1", userId: "user-1",
    policy,
    occurredAt: "2026-09-28T12:00:00.000Z",
    credentialsValid: false,
  });
  assert.equal(result.reason, "invalid_credentials");
  assert.equal(committed?.failedAttempts.length, 1);
});
test("federated sign-in validates callback URL before the adapter", async () => {
  const provider: FederatedSignInPort = {
    startSignIn: async () => ({ redirectUrl: "https://login.example.test" }),
  };
  const service = new StartFederatedSignIn(
    provider,
    new FederatedRedirectPolicy(["https://app.example.test"]),
  );
  await assert.rejects(
    () =>
      service.execute({
        provider: "azure",
        redirectTo: "https://untrusted.example.test/auth/callback",
      }),
    { code: "INVALID_INPUT" },
  );
  assert.equal(
    (
      await service.execute({
        provider: "azure",
        redirectTo: "https://app.example.test/auth/callback",
      })
    ).redirectUrl,
    "https://login.example.test",
  );
});
test("serialized attempts cannot lose a concurrent failure and failed commits preserve state", async () => {
  const repository = new InMemoryAccountSecurityRepository([state]);
  const service = new EvaluateAccountAuthentication(repository);
  await Promise.all([
    service.execute({
      organizationId: "organization-1", userId: "user-1",
      policy,
      occurredAt: "2026-09-28T12:00:00.000Z",
      credentialsValid: false,
    }),
    service.execute({
      organizationId: "organization-1", userId: "user-1",
      policy,
      occurredAt: "2026-09-28T12:01:00.000Z",
      credentialsValid: false,
    }),
  ]);
  assert.equal(
    repository.snapshot("organization-1", "user-1")?.lockedUntil,
    "2026-09-28T12:11:00.000Z",
  );
  const before = repository.snapshot("organization-1", "user-1");
  repository.failFollowingCommit();
  await assert.rejects(() =>
    service.execute({
      organizationId: "organization-1", userId: "user-1",
      policy,
      occurredAt: "2026-09-28T12:02:00.000Z",
      credentialsValid: false,
    }),
  );
  assert.deepEqual(repository.snapshot("organization-1", "user-1"), before);
});
