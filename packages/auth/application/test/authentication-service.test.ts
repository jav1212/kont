import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedSession } from "@kontave/auth-domain";
import { AuthenticationService, type AuthenticationGateway, type SignInCommand } from "../src/index.js";

class GatewaySpy implements AuthenticationGateway {
  command?: SignInCommand;
  async signIn(command: SignInCommand): Promise<AuthenticatedSession> {
    this.command = command;
    return { identity: { userId: "user-1", email: command.email }, expiresAt: null };
  }
  async restoreSession(): Promise<AuthenticatedSession | null> { return null; }
  async signOut(): Promise<void> {}
  async getAccessToken(): Promise<string | null> { return null; }
}

test("sign in normalizes the email before reaching the gateway", async () => {
  const gateway = new GatewaySpy();
  await new AuthenticationService(gateway).signIn({ email: " USER@Example.COM ", password: "secret" });
  assert.equal(gateway.command?.email, "user@example.com");
});

test("sign in rejects incomplete credentials", () => {
  const service = new AuthenticationService(new GatewaySpy());
  assert.throws(() => service.signIn({ email: "invalid", password: "" }), { code: "INVALID_INPUT" });
});
