import assert from "node:assert/strict";
import test from "node:test";
import { AuthenticationFailure, type AuthenticatedSession, type RefreshedAuthenticatedSession } from "@kontave/auth-domain";
import {
  AccessTokenRejectedFailure,
  NativeSessionRefreshCoordinator,
  type AuthenticationGateway,
  type SignInCommand,
} from "../src/index";

const session: AuthenticatedSession = {
  identity: { userId: "user-1", email: "user@example.com" },
  expiresAt: 123,
};

class GatewaySpy implements AuthenticationGateway {
  accessToken: string | null = "old-token";
  refreshCount = 0;
  clearCount = 0;
  refreshResult: () => Promise<RefreshedAuthenticatedSession> = async () => ({
    session,
    credentials: { accessToken: "new-token", refreshToken: "new-refresh" },
  });
  async signIn(_command: SignInCommand): Promise<AuthenticatedSession> { return session; }
  async restoreSession(): Promise<AuthenticatedSession | null> { return session; }
  async signOut(): Promise<void> {}
  async getAccessToken(): Promise<string | null> { return this.accessToken; }
  async refreshSession(): Promise<RefreshedAuthenticatedSession> { this.refreshCount += 1; return this.refreshResult(); }
  async clearSession(): Promise<void> { this.clearCount += 1; this.accessToken = null; }
}

test("renews and retries an operation once with the updated access token", async () => {
  const gateway = new GatewaySpy();
  const coordinator = new NativeSessionRefreshCoordinator(gateway);
  const tokens: string[] = [];
  const result = await coordinator.execute(async (token) => {
    tokens.push(token);
    if (token === "old-token") throw new AccessTokenRejectedFailure();
    return "ok";
  });
  assert.equal(result, "ok");
  assert.deepEqual(tokens, ["old-token", "new-token"]);
  assert.equal(gateway.refreshCount, 1);
});

test("concurrent rejected operations share one refresh", async () => {
  const gateway = new GatewaySpy();
  let release: (() => void) | undefined;
  gateway.refreshResult = () => new Promise((resolve) => {
    release = () => resolve({ session, credentials: { accessToken: "new-token", refreshToken: "new-refresh" } });
  });
  const coordinator = new NativeSessionRefreshCoordinator(gateway);
  const operation = (token: string) => token === "old-token"
    ? Promise.reject(new AccessTokenRejectedFailure())
    : Promise.resolve(token);
  const first = coordinator.execute(operation);
  const second = coordinator.execute(operation);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(gateway.refreshCount, 1);
  release?.();
  assert.deepEqual(await Promise.all([first, second]), ["new-token", "new-token"]);
});

test("does not retry a request more than once", async () => {
  const gateway = new GatewaySpy();
  const coordinator = new NativeSessionRefreshCoordinator(gateway);
  let attempts = 0;
  await assert.rejects(
    () => coordinator.execute(async () => { attempts += 1; throw new AccessTokenRejectedFailure(); }),
    { code: "SESSION_EXPIRED" },
  );
  assert.equal(attempts, 2);
  assert.equal(gateway.refreshCount, 1);
  assert.equal(gateway.clearCount, 1);
});

test("an invalid refresh clears persistence and emits one global expiration", async () => {
  const gateway = new GatewaySpy();
  gateway.refreshResult = async () => { throw new AuthenticationFailure("SESSION_EXPIRED", "expired"); };
  const coordinator = new NativeSessionRefreshCoordinator(gateway);
  let events = 0;
  coordinator.subscribeSessionExpired(() => { events += 1; });
  const operation = () => Promise.reject(new AccessTokenRejectedFailure());
  const results = await Promise.allSettled([coordinator.execute(operation), coordinator.execute(operation)]);
  assert.ok(results.every((result) => result.status === "rejected" && result.reason instanceof AuthenticationFailure));
  assert.equal(gateway.refreshCount, 1);
  assert.equal(gateway.clearCount, 1);
  assert.equal(events, 1);
});
