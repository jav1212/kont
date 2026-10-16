import assert from "node:assert/strict";
import test from "node:test";
import {
  InvitationCallbackPolicy,
  ProvisionOrganizationInvitationIdentity,
  type InvitationIdentityProvider,
  type OrganizationInvitationAuthorizer,
} from "../../src/application/provision-user";
import { AuthenticationFailure } from "../../src/domain";

test("authorization denial never invokes the invitation provider", async () => {
  let calls = 0;
  const authorizer: OrganizationInvitationAuthorizer = { async authorizeInvitation() { throw new AuthenticationFailure("ACCOUNT_SECURITY_DENIED", "Denied"); } };
  const provider: InvitationIdentityProvider = { async inviteUser() { calls += 1; return { userId: "user", email: "member@example.test" }; } };
  const service = new ProvisionOrganizationInvitationIdentity(authorizer, new InvitationCallbackPolicy(["https://app.example.test/invitations/accept"]), provider);
  await assert.rejects(() => service.execute({ actorUserId: "actor", organizationId: "organization", email: "member@example.test", redirectTo: "https://app.example.test/invitations/accept" }), { code: "ACCOUNT_SECURITY_DENIED" });
  assert.equal(calls, 0);
});

test("invalid callback has no authorization or provider side effect", async () => {
  let authorizationCalls = 0;
  let providerCalls = 0;
  const authorizer: OrganizationInvitationAuthorizer = { async authorizeInvitation() { authorizationCalls += 1; } };
  const provider: InvitationIdentityProvider = { async inviteUser() { providerCalls += 1; return { userId: "user", email: "member@example.test" }; } };
  const service = new ProvisionOrganizationInvitationIdentity(authorizer, new InvitationCallbackPolicy(["https://app.example.test/invitations/accept"]), provider);
  await assert.rejects(() => service.execute({ actorUserId: "actor", organizationId: "organization", email: "member@example.test", redirectTo: "https://app.example.test/other" }), { code: "INVALID_INPUT" });
  assert.equal(authorizationCalls, 0);
  assert.equal(providerCalls, 0);
});

test("existing identity remains a typed safe failure", async () => {
  const authorizer: OrganizationInvitationAuthorizer = { async authorizeInvitation() {} };
  const provider: InvitationIdentityProvider = { async inviteUser() { throw new AuthenticationFailure("IDENTITY_ALREADY_EXISTS", "Exists"); } };
  const service = new ProvisionOrganizationInvitationIdentity(authorizer, new InvitationCallbackPolicy(["https://app.example.test/invitations/accept"]), provider);
  await assert.rejects(() => service.execute({ actorUserId: "actor", organizationId: "organization", email: "member@example.test", redirectTo: "https://app.example.test/invitations/accept" }), { code: "IDENTITY_ALREADY_EXISTS" });
});

test("provider data with an email different from the authorized invitation is rejected", async () => {
  const authorizer: OrganizationInvitationAuthorizer = { async authorizeInvitation() {} };
  const provider: InvitationIdentityProvider = {
    async inviteUser() {
      return { userId: "user", email: "other@example.test" };
    },
  };
  const service = new ProvisionOrganizationInvitationIdentity(
    authorizer,
    new InvitationCallbackPolicy(["https://app.example.test/invitations/accept"]),
    provider,
  );
  await assert.rejects(
    () =>
      service.execute({
        actorUserId: "actor",
        organizationId: "organization",
        email: "member@example.test",
        redirectTo: "https://app.example.test/invitations/accept",
      }),
    { code: "PROVIDER_UNAVAILABLE" },
  );
});
