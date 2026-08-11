import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationSource, PERMISSIONS, SameOrganizationPolicy, permissionCode } from "../src/index.js";

test("permission catalog rejects unknown and misspelled permissions", () => {
  assert.equal(permissionCode(PERMISSIONS.BILLING_READ), "billing.read");
  assert.throws(() => permissionCode("billing.delet"), /Unknown permission/);
});
test("resource policy rejects cross-organization access", () => {
  const result = new SameOrganizationPolicy().evaluate({ actor: { userId: "u", organizationId: "a" }, permission: permissionCode(PERMISSIONS.BILLING_READ), resource: { type: "billing", organizationId: "b" }, context: { requestId: "r", source: AuthorizationSource.Desktop, occurredAt: new Date(0).toISOString() } });
  assert.equal(result?.reason, "resource_outside_organization");
});
