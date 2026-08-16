import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationSource, PERMISSIONS, Role, RoleKind, RoleStatus, permissionCode, roleId, membershipId, type AuthorizationSnapshot } from "@kontave/access-control-domain";
import { MembershipStatus, OrganizationStatus } from "@kontave/organizations-domain";
import { EvaluateAuthorization, RequireAuthorization, type AccessControlRepository, type AuthorizationAudit } from "../src/index";
const snapshot: AuthorizationSnapshot = { membershipId: membershipId("member-1"), membershipStatus: MembershipStatus.Active, authorizationVersion: 1, organizationStatus: OrganizationStatus.Active, role: new Role({ id: roleId("role-1"), organizationId: "org-1", code: "custom", name: "Custom", description: "", kind: RoleKind.Custom, status: RoleStatus.Active, version: 1, permissions: [permissionCode(PERMISSIONS.BILLING_READ)] }) };
class Repository implements AccessControlRepository { constructor(private readonly value: AuthorizationSnapshot | null) {} async findSnapshot() { return this.value; } }
class Audit implements AuthorizationAudit { calls = 0; async record() { this.calls += 1; } }
const request = { actor: { userId: "user-1", organizationId: "org-1" }, permission: permissionCode(PERMISSIONS.BILLING_READ), resource: { type: "billing", organizationId: "org-1" }, context: { requestId: "request-1", source: AuthorizationSource.Desktop, occurredAt: new Date(0).toISOString() } };
test("evaluates an explainable allow and records it", async () => { const audit = new Audit(); const result = await new EvaluateAuthorization(new Repository(snapshot), audit).execute(request); assert.deepEqual(result, { allowed: true, reason: "permission_granted", matchedPolicy: "required-permission", policyVersion: "1" }); assert.equal(audit.calls, 1); });
test("require throws an explainable denial", async () => { const evaluate = new EvaluateAuthorization(new Repository(null), new Audit()); await assert.rejects(() => new RequireAuthorization(evaluate).execute(request), (error: unknown) => error instanceof Error && "decision" in error && (error as { decision: { reason: string } }).decision.reason === "membership_inactive"); });
