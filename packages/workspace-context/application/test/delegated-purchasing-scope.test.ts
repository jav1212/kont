import assert from "node:assert/strict";
import test from "node:test";
import { PERMISSIONS, permissionCode } from "@kontave/access-control-domain";
import { DelegatedScope, OrganizationAccessPathKind, organizationDelegationId } from "@kontave/organization-delegations-domain";
import { organizationId, userId } from "@kontave/organizations-domain";
import { DelegatedPermissionScopePolicy } from "../src/index.js";

test("purchasing permissions require the explicit purchases delegation scope", () => {
  const base = {
    kind: OrganizationAccessPathKind.DelegatedOrganization,
    actorUserId: userId("user"),
    actingOrganizationId: organizationId("provider"),
    targetOrganizationId: organizationId("client"),
    delegationId: organizationDelegationId("delegation"),
  } as const;
  const policy = new DelegatedPermissionScopePolicy();
  assert.equal(policy.permits({ ...base, scopes: [DelegatedScope.Purchases] }, permissionCode(PERMISSIONS.PURCHASES_READ)), true);
  assert.equal(policy.permits({ ...base, scopes: [DelegatedScope.Inventory] }, permissionCode(PERMISSIONS.PURCHASES_READ)), false);
});
