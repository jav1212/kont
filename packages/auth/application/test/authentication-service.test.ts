import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedSession } from "@kontave/auth-domain";
import {
  AuthenticationService,
  PasswordRecoveryService,
  RegistrationService,
  type AuthenticationGateway,
  type PasswordRecoveryPort,
  type RegisterCredentialsCommand,
  type RegistrationPort,
  type SignInCommand,
  type VerifyPasswordRecoveryCodeCommand,
  type VerifyRegistrationCodeCommand,
} from "../src/index.js";

const session: AuthenticatedSession = { identity: { userId: "user-1", email: "user@example.com" }, expiresAt: null };

class AuthenticationGatewaySpy implements AuthenticationGateway {
  command?: SignInCommand;
  async signIn(command: SignInCommand): Promise<AuthenticatedSession> { this.command = command; return session; }
  async restoreSession(): Promise<AuthenticatedSession | null> { return null; }
  async signOut(): Promise<void> {}
  async getAccessToken(): Promise<string | null> { return null; }
}

class RegistrationPortSpy implements RegistrationPort {
  registerCommand?: RegisterCredentialsCommand;
  verifyCommand?: VerifyRegistrationCodeCommand;
  resentEmail?: string;
  async register(command: RegisterCredentialsCommand): Promise<void> { this.registerCommand = command; }
  async verifyRegistrationCode(command: VerifyRegistrationCodeCommand): Promise<AuthenticatedSession> { this.verifyCommand = command; return session; }
  async resendRegistrationCode(email: string): Promise<void> { this.resentEmail = email; }
}

class PasswordRecoveryPortSpy implements PasswordRecoveryPort {
  requestedEmail?: string;
  verifyCommand?: VerifyPasswordRecoveryCodeCommand;
  completedPassword?: string;
  async requestPasswordRecovery(email: string): Promise<void> { this.requestedEmail = email; }
  async verifyPasswordRecoveryCode(command: VerifyPasswordRecoveryCodeCommand): Promise<void> { this.verifyCommand = command; }
  async completePasswordRecovery(password: string): Promise<void> { this.completedPassword = password; }
}

test("sign in normalizes the email before reaching the gateway", async () => {
  const gateway = new AuthenticationGatewaySpy();
  await new AuthenticationService(gateway).signIn({ email: " USER@Example.COM ", password: "secret" });
  assert.equal(gateway.command?.email, "user@example.com");
});

test("registration validates the shared password policy", async () => {
  const port = new RegistrationPortSpy();
  const service = new RegistrationService(port);
  await assert.rejects(() => service.register({ email: "user@example.com", password: "weak" }), { code: "PASSWORD_POLICY_VIOLATION" });
  await service.register({ email: " USER@Example.com ", password: "Strong!123" });
  assert.equal(port.registerCommand?.email, "user@example.com");
});

test("registration strips non-digits from a valid verification code", async () => {
  const port = new RegistrationPortSpy();
  await new RegistrationService(port).verifyCode({ email: "user@example.com", code: "12 34-5678" });
  assert.equal(port.verifyCommand?.code, "12345678");
});

test("password recovery cannot complete before code verification", async () => {
  const service = new PasswordRecoveryService(new PasswordRecoveryPortSpy());
  await assert.rejects(() => service.complete({ password: "Strong!123" }), { code: "RECOVERY_NOT_VERIFIED" });
});

test("password recovery completes only after a valid code", async () => {
  const port = new PasswordRecoveryPortSpy();
  const service = new PasswordRecoveryService(port);
  await service.request({ email: "user@example.com" });
  await service.verifyCode({ email: "user@example.com", code: "12345678" });
  await service.complete({ password: "NewStrong!123" });
  assert.equal(port.completedPassword, "NewStrong!123");
});
