import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticatedSessionId,
  type AuthenticatedDeviceSession,
} from "@kontave/auth-domain";
import {
  ChangePassword,
  ListAuthenticatedSessions,
  RevokeAuthenticatedSession,
  type CredentialSecurityPort,
  type NativeSessionRegistry,
} from "../src/index.js";

const currentId = authenticatedSessionId("11111111-1111-1111-1111-111111111111");
const otherId = authenticatedSessionId("22222222-2222-2222-2222-222222222222");

class RegistrySpy implements NativeSessionRegistry {
  revoked: string[] = [];
  revokeOthersCount = 0;

  async observe(): Promise<void> {}

  async list(userId: string): Promise<readonly Omit<AuthenticatedDeviceSession, "current">[]> {
    return [currentId, otherId].map((id) => ({
      id,
      userId,
      client: "desktop",
      deviceName: null,
      operatingSystem: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      revokedAt: null,
    }));
  }

  async revoke(input: { readonly sessionId: typeof currentId }): Promise<void> {
    this.revoked.push(input.sessionId);
  }

  async revokeOthers(): Promise<void> {
    this.revokeOthersCount += 1;
  }
}

class CredentialSpy implements CredentialSecurityPort {
  calls: { accessToken: string; newPassword: string }[] = [];

  async changePassword(accessToken: string, newPassword: string): Promise<void> {
    this.calls.push({ accessToken, newPassword });
  }
}

test("lists sessions and identifies only the current provider session", async () => {
  const sessions = await new ListAuthenticatedSessions(new RegistrySpy()).execute("user-1", currentId);
  assert.deepEqual(sessions.map(({ id, current }) => ({ id, current })), [
    { id: currentId, current: true },
    { id: otherId, current: false },
  ]);
});

test("requires the normal sign-out flow to revoke the current session", async () => {
  const registry = new RegistrySpy();
  const revoke = new RevokeAuthenticatedSession(registry);
  await assert.rejects(
    async () => revoke.execute({ userId: "user-1", sessionId: currentId, currentSessionId: currentId }),
    { code: "INVALID_INPUT" },
  );
  assert.deepEqual(registry.revoked, []);
});

test("changes a valid password and optionally revokes every other session", async () => {
  const registry = new RegistrySpy();
  const credentials = new CredentialSpy();
  const changePassword = new ChangePassword(credentials, registry);

  await changePassword.execute({
    userId: "user-1",
    currentSessionId: currentId,
    accessToken: "access-token",
    newPassword: "NuevaClave1!",
    revokeOtherSessions: true,
  });

  assert.deepEqual(credentials.calls, [{ accessToken: "access-token", newPassword: "NuevaClave1!" }]);
  assert.equal(registry.revokeOthersCount, 1);
});

test("rejects an invalid password before contacting the provider", async () => {
  const registry = new RegistrySpy();
  const credentials = new CredentialSpy();
  const changePassword = new ChangePassword(credentials, registry);

  await assert.rejects(
    () => changePassword.execute({
      userId: "user-1",
      currentSessionId: currentId,
      accessToken: "access-token",
      newPassword: "weak",
      revokeOtherSessions: true,
    }),
    { code: "PASSWORD_POLICY_VIOLATION" },
  );
  assert.deepEqual(credentials.calls, []);
  assert.equal(registry.revokeOthersCount, 0);
});
