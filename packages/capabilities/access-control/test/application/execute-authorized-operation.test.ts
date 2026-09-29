import assert from "node:assert/strict";
import test from "node:test";
import { EvaluateAuthorization, ExecuteAuthorizedOperation, RequireAuthorization, RequireBusinessOperationAuthorization, type AuthorizationAudit, type AccessControlRepository, type ScopedAccessGrantReader } from "../../src/application";
import { MembershipStatus, OrganizationStatus } from "@kontave/organizations/domain";
import { AuthorizationDenied, AuthorizationSource, BusinessAuthorizationOperation, permissionCode, Role, RoleKind, RoleStatus, roleId, ScopedAccessTargetKind, type AuthorizationSnapshot } from "../../src/domain";

const snapshot: AuthorizationSnapshot = { membershipId: "membership" as never, membershipStatus: MembershipStatus.Active, authorizationVersion: 1, organizationStatus: OrganizationStatus.Active, role: new Role({ id: roleId("role"), organizationId: "organization", code: "operator", name: "Operator", description: "", kind: RoleKind.Custom, status: RoleStatus.Active, version: 1, permissions: [permissionCode("modules.access")] }) };
const repository: AccessControlRepository = { async findSnapshot() { return snapshot; }, async findSnapshots() { return new Map([["organization", snapshot]]); } };
const audit: AuthorizationAudit = { async record() {} };
const deniedGrant: ScopedAccessGrantReader = { async hasGrant() { return false; } };

test("authorized operation never calls its delegate when an exact target grant is denied", async () => {
  const require = new RequireAuthorization(new EvaluateAuthorization(repository, audit));
  const command = new ExecuteAuthorizedOperation(new RequireBusinessOperationAuthorization(require, deniedGrant, audit));
  let called = false;
  await assert.rejects(() => command.execute({ actor: { userId: "actor", organizationId: "organization" }, operation: BusinessAuthorizationOperation.AccessModule, target: { kind: ScopedAccessTargetKind.Module, id: "payroll" }, resource: { organizationId: "organization", type: "module" }, context: { requestId: "request", source: AuthorizationSource.Desktop, occurredAt: new Date().toISOString() } }, async () => { called = true; return "unsafe"; }), AuthorizationDenied);
  assert.equal(called, false);
});
