import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_POST_AUTHENTICATION_DESTINATION,
  resolvePostAuthenticationDestination,
} from "../src/modules/auth/post-authentication-destination";
import {
  getOrganizationRouteAccess,
  resolveOrganizationRouteAccess,
} from "../src/modules/organizations/frontend/module-access-policy";

test("newly authenticated members land on an authenticated route without organization permissions", () => {
  assert.equal(DEFAULT_POST_AUTHENTICATION_DESTINATION, "/tools");
  assert.equal(resolvePostAuthenticationDestination(null, null), "/tools");
  assert.equal(
    resolveOrganizationRouteAccess(getOrganizationRouteAccess(DEFAULT_POST_AUTHENTICATION_DESTINATION), {
      authStatus: "authenticated",
      loading: false,
      error: null,
      permissions: null,
    }),
    "allowed",
  );
});

test("explicit return routes retain their existing authorization boundary", () => {
  assert.equal(resolvePostAuthenticationDestination("/sales/pos?tid=tenant-1", "/documents"), "/sales/pos?tid=tenant-1");
  assert.equal(resolvePostAuthenticationDestination(null, "/accept-invite?token=token-1"), "/accept-invite?token=token-1");
});

test("the cashier's authorized sales route remains available while unrelated modules remain protected", () => {
  const cashier = ["companies.read", "inventory.read", "sales.read", "sales.create"];
  const snapshot = { authStatus: "authenticated" as const, loading: false, error: null, permissions: cashier };
  assert.equal(resolveOrganizationRouteAccess(getOrganizationRouteAccess("/sales/pos"), snapshot), "allowed");
  assert.equal(resolveOrganizationRouteAccess(getOrganizationRouteAccess("/documents"), snapshot), "denied");
  assert.equal(resolveOrganizationRouteAccess(getOrganizationRouteAccess("/payroll"), snapshot), "denied");
});
