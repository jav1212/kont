import assert from "node:assert/strict";
import test from "node:test";
import { PERMISSIONS, permissionCode } from "@kontave/access-control-domain";
import { DelegatedAccessScope, OrganizationAccessPathKind, delegatedAccessGrantId } from "@kontave/delegated-access-domain";
import { organizationId, userId } from "@kontave/organizations-domain";
import { DelegatedPermissionScopePolicy } from "../src/index";

test("purchasing permissions require the explicit purchases grant scope", () => {
  const base = {
    kind: OrganizationAccessPathKind.DelegatedOrganization,
    actorUserId: userId("user"),
    actingOrganizationId: organizationId("provider"),
    targetOrganizationId: organizationId("client"),
    delegationId: delegatedAccessGrantId("grant"),
  } as const;
  const policy = new DelegatedPermissionScopePolicy();
  assert.equal(policy.permits({ ...base, scopes: [DelegatedAccessScope.Purchases] }, permissionCode(PERMISSIONS.PURCHASES_READ)), true);
  assert.equal(policy.permits({ ...base, scopes: [DelegatedAccessScope.Inventory] }, permissionCode(PERMISSIONS.PURCHASES_READ)), false);
});
