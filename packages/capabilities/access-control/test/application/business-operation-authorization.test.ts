import assert from "node:assert/strict";
import test from "node:test";
import {
  EvaluateAuthorization,
  RequireAuthorization,
  RequireBusinessOperationAuthorization,
  type AccessControlRepository,
  type AuthorizationAudit,
} from "../../src/application";
import {
  InMemoryScopedAccessGrants,
  RecordingAuthorizationAudit,
} from "../../src/testing";
import {
  AuthorizationSource,
  BusinessAuthorizationOperation,
  PERMISSIONS,
  Role,
  RoleKind,
  RoleStatus,
  ScopedAccessTargetKind,
  membershipId,
  permissionCode,
  roleId,
  type AuthorizationSnapshot,
} from "../../src/domain";
import {
  MembershipStatus,
  OrganizationStatus,
} from "@kontave/organizations/domain";

const snapshot: AuthorizationSnapshot = {
  membershipId: membershipId("member-1"),
  membershipStatus: MembershipStatus.Active,
  authorizationVersion: 1,
  organizationStatus: OrganizationStatus.Active,
  role: new Role({
    id: roleId("role-1"),
    organizationId: "organization-1",
    code: "custom",
    name: "Custom",
    description: "",
    kind: RoleKind.Custom,
    permissions: [
      permissionCode(PERMISSIONS.DOCUMENTS_PRINT),
      permissionCode(PERMISSIONS.SALES_PRICE_LISTS_USE),
    ],
    status: RoleStatus.Active,
    version: 1,
  }),
};
const repository: AccessControlRepository = {
  findSnapshot: async () => snapshot,
  findSnapshots: async () => new Map([["organization-1", snapshot]]),
};
const audit: AuthorizationAudit = { record: async () => undefined };
const request = {
  actor: { userId: "user-1", organizationId: "organization-1" },
  resource: {
    type: "document",
    id: "document-1",
    organizationId: "organization-1",
  },
  context: {
    requestId: "request-1",
    source: AuthorizationSource.Web,
    occurredAt: "2026-09-28T12:00:00.000Z",
  },
};

test("exact grants cannot collide when actor identifiers contain separators", async () => {
  const grants = new InMemoryScopedAccessGrants();
  const input = {
    actor: { userId: "user|org", organizationId: "one" },
    permission: permissionCode(PERMISSIONS.SALES_PRICE_LISTS_USE),
    target: { kind: ScopedAccessTargetKind.PriceList, id: "retail" },
    resource: undefined,
  };
  await grants.grant({ administrator: input.actor, membershipId: input.actor.userId, permission: input.permission, target: input.target, resource: input.resource });
  assert.equal(
    await grants.hasGrant({
      ...input,
      actor: { userId: "user", organizationId: "org|one" },
    }),
    false,
  );
});

test("business operation enforcement resolves print to its dedicated permission", async () => {
  const require = new RequireAuthorization(
    new EvaluateAuthorization(repository, audit),
  );
  const decision = await new RequireBusinessOperationAuthorization(
    require,
    new InMemoryScopedAccessGrants(),
    audit,
  ).execute({
    ...request,
    operation: BusinessAuthorizationOperation.PrintDocument,
  });
  assert.equal(decision.allowed, true);
  await assert.rejects(
    () =>
      new RequireBusinessOperationAuthorization(
        require,
        new InMemoryScopedAccessGrants(),
        audit,
      ).execute({
        ...request,
        operation: BusinessAuthorizationOperation.ReverseReceivablePayment,
      }),
    { name: "AuthorizationDenied" },
  );
});

test("price-list authorization requires both its role permission and an exact allow-list grant", async () => {
  const grants = new InMemoryScopedAccessGrants();
  await grants.grant({
    administrator: request.actor,
    membershipId: request.actor.userId,
    permission: permissionCode(PERMISSIONS.SALES_PRICE_LISTS_USE),
    target: { kind: ScopedAccessTargetKind.PriceList, id: "retail" },
    resource: { ...request.resource, companyId: "company-a" },
  });
  const require = new RequireAuthorization(
    new EvaluateAuthorization(repository, audit),
  );
  const recordingAudit = new RecordingAuthorizationAudit();
  const service = new RequireBusinessOperationAuthorization(
    require,
    grants,
    recordingAudit,
  );
  await service.execute({
    ...request,
    resource: { ...request.resource, companyId: "company-a" },
    operation: BusinessAuthorizationOperation.UsePriceList,
    target: { kind: ScopedAccessTargetKind.PriceList, id: "retail" },
  });
  await assert.rejects(
    () =>
      service.execute({
        ...request,
        resource: { ...request.resource, companyId: "company-b" },
        operation: BusinessAuthorizationOperation.UsePriceList,
        target: { kind: ScopedAccessTargetKind.PriceList, id: "retail" },
      }),
    { name: "AuthorizationDenied" },
  );
  assert.deepEqual(
    recordingAudit.entries.map((entry) => entry.decision.allowed),
    [false],
  );
});
