import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationSource, PERMISSIONS, SameOrganizationPolicy, effectivePermissionCodes, permissionCode } from "../../src/domain";

test("permission catalog rejects unknown and misspelled permissions", () => {
  assert.equal(permissionCode(PERMISSIONS.BILLING_READ), "billing.read");
  assert.equal(permissionCode(PERMISSIONS.ACCESS_MANAGE), "access.manage");
  assert.equal(permissionCode(PERMISSIONS.SALES_READ_DASHBOARD), "sales.read.dashboard");
  assert.throws(() => permissionCode("billing.delet"), /Unknown permission/);
  assert.throws(() => permissionCode("access.read"), /Unknown permission/);
});
test("resource policy rejects cross-organization access", () => {
  const result = new SameOrganizationPolicy().evaluate({ actor: { userId: "u", organizationId: "a" }, permission: permissionCode(PERMISSIONS.BILLING_READ), resource: { type: "billing", organizationId: "b" }, context: { requestId: "r", source: AuthorizationSource.Desktop, occurredAt: new Date(0).toISOString() } });
  assert.equal(result?.reason, "resource_outside_organization");
});
test("effective grants expand wildcard and ignore unknown values", () => {
  assert.ok(effectivePermissionCodes(["*"]).includes(permissionCode(PERMISSIONS.SALES_READ_DASHBOARD)));
  assert.deepEqual(effectivePermissionCodes([PERMISSIONS.SALES_READ, "sales.future.read"]), [permissionCode(PERMISSIONS.SALES_READ)]);
});
