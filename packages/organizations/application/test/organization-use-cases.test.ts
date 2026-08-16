import assert from "node:assert/strict";
import test from "node:test";
import {
  companyId,
  MembershipStatus,
  OrganizationRole,
  OrganizationRelationship,
  OrganizationStatus,
  organizationId,
  userId,
  type OrganizationAccess,
  type OrganizationCompany,
} from "@kontave/organizations-domain";
import {
  InviteOrganizationMember,
  ListOrganizationCompanies,
  RevokeOrganizationMembership,
  UpdateOrganizationMembership,
  type OrganizationDirectory,
  type OrganizationMembersRepository,
} from "../src/index";

const ownerId = userId("user-1");
const ownOrganizationId = organizationId("org-1");
const access: OrganizationAccess = {
  relationship: OrganizationRelationship.Personal,
  organization: { id: ownOrganizationId, name: "Kontave", slug: "kontave", status: OrganizationStatus.Active, logoUrl: null, version: 1 },
  membership: { organizationId: ownOrganizationId, userId: ownerId, role: OrganizationRole.Owner, status: MembershipStatus.Active, permissions: ["*"] },
};
const company: OrganizationCompany = { id: companyId("J-1"), organizationId: ownOrganizationId, name: "Empresa", rif: "J-1", logoUrl: null };

class FakeDirectory implements OrganizationDirectory {
  async listAccessForUser() { return [access]; }
  async findAccess(_userId: typeof ownerId, target: typeof ownOrganizationId) { return target === ownOrganizationId ? access : null; }
  async listCompanies() { return [company]; }
  async findCompany() { return company; }
}

test("companies are returned only after active organization access is confirmed", async () => {
  const result = await new ListOrganizationCompanies(new FakeDirectory()).execute(ownerId, ownOrganizationId);
  assert.deepEqual(result, [company]);
});

test("foreign organizations are denied before querying their companies", async () => {
  const useCase = new ListOrganizationCompanies(new FakeDirectory());
  await assert.rejects(() => useCase.execute(ownerId, organizationId("org-2")), { code: "ORGANIZATION_ACCESS_DENIED" });
});

test("a repository cannot leak a company from another organization", async () => {
  class LeakingDirectory extends FakeDirectory {
    override async listCompanies() {
      return [{ ...company, organizationId: organizationId("org-2") }];
    }
  }
  const useCase = new ListOrganizationCompanies(new LeakingDirectory());
  await assert.rejects(() => useCase.execute(ownerId, ownOrganizationId), { code: "COMPANY_ACCESS_DENIED" });
});

test("member mutations preserve the authenticated actor at the repository boundary", async () => {
  const calls: unknown[] = [];
  const repository: OrganizationMembersRepository = {
    async list() { return []; },
    async invite(input) { calls.push(input); return { member: memberProjection("invitation"), created: true }; },
    async resend() { return memberProjection("invitation"); },
    async revokeInvitation() {},
    async update(input) { calls.push(input); return memberProjection("membership"); },
    async revoke(input) { calls.push(input); },
  };

  await new UpdateOrganizationMembership(repository).execute({
    organizationId: ownOrganizationId,
    actorUserId: ownerId,
    membershipId: "membership-1",
    roleId: "role-1",
    expectedVersion: 2,
  });
  await new RevokeOrganizationMembership(repository).execute({
    organizationId: ownOrganizationId,
    actorUserId: ownerId,
    membershipId: "membership-1",
    expectedVersion: 3,
  });

  assert.equal((calls[0] as { actorUserId: string }).actorUserId, ownerId);
  assert.equal((calls[1] as { actorUserId: string }).actorUserId, ownerId);
});

test("member invitation normalizes email and creates an opaque token hash", async () => {
  let invitation: Parameters<OrganizationMembersRepository["invite"]>[0] | undefined;
  const repository: OrganizationMembersRepository = {
    async list() { return []; },
    async invite(input) { invitation = input; return { member: memberProjection("invitation"), created: true }; },
    async resend() { return memberProjection("invitation"); },
    async revokeInvitation() {},
    async update() { return memberProjection("membership"); },
    async revoke() {},
  };
  const notifications: unknown[] = [];
  await new InviteOrganizationMember(repository, { async sendInvitation(input) { notifications.push(input); } }).execute({
    organizationId: ownOrganizationId,
    actorUserId: ownerId,
    email: "  Person@Example.com ",
    roleId: "role-1",
    idempotencyKey: "request-1",
    expiresAt: "2030-01-01T00:00:00.000Z",
    organizationName: "Kontave",
    inviterDisplayName: "Owner",
  });
  assert.equal(invitation?.email, "person@example.com");
  assert.match(invitation?.rawToken ?? "", /^[0-9a-f-]{36}$/);
  assert.match(invitation?.tokenHash ?? "", /^[0-9a-f]{64}$/);
  assert.deepEqual((notifications[0] as { destination: unknown }).destination, {
    id: "organization.invitation.accept",
    parameters: { token: invitation?.rawToken },
  });
});

test("an idempotent invitation replay does not send a second email", async () => {
  let notifications = 0;
  const repository: OrganizationMembersRepository = {
    async list() { return []; },
    async invite() { return { member: memberProjection("invitation"), created: false }; },
    async resend() { return memberProjection("invitation"); },
    async revokeInvitation() {},
    async update() { return memberProjection("membership"); },
    async revoke() {},
  };
  await new InviteOrganizationMember(repository, { async sendInvitation() { notifications += 1; } }).execute({
    organizationId: ownOrganizationId, actorUserId: ownerId, email: "person@example.com",
    roleId: "role-1", idempotencyKey: "request-1", expiresAt: "2030-01-01T00:00:00.000Z",
    organizationName: "Kontave", inviterDisplayName: "Owner",
  });
  assert.equal(notifications, 0);
});

function memberProjection(kind: "membership" | "invitation") {
  return {
    id: `${kind}-1`, kind, organizationId: ownOrganizationId,
    userId: kind === "membership" ? ownerId : null,
    email: "person@example.com", displayName: null, avatarUrl: null,
    roleId: "role-1", roleName: "Administrador",
    status: kind === "membership" ? "active" as const : "invited" as const,
    version: 1, joinedAt: null, invitedAt: null, expiresAt: null,
  };
}
