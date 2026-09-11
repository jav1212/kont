import assert from "node:assert/strict";
import test from "node:test";
import { createOrganizationsDirectory } from "../../src/adapters/supabase";
import { userId } from "../../src/domain";

const actor = "10000000-0000-4000-8000-000000000001";
const organizationA = "20000000-0000-4000-8000-000000000001";
const organizationB = "20000000-0000-4000-8000-000000000002";
const roleA = "30000000-0000-4000-8000-000000000001";
const roleB = "30000000-0000-4000-8000-000000000002";

test("identical legacy roles get independent effective permissions in each organization", async (context) => {
  const queried: string[] = [];
  context.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    const path = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).pathname;
    queried.push(path);
    const rows = path.endsWith("organization_memberships") ? [
      { organization_id: organizationA, user_id: actor, role: "admin", role_id: roleA, status: "active" },
      { organization_id: organizationB, user_id: actor, role: "admin", role_id: roleB, status: "active" },
    ] : path.endsWith("organization_roles") ? [
      { id: roleA, organization_id: organizationA, code: "admin", kind: "system", status: "active", organization_role_permissions: [{ permission_code: "members.read" }] },
      { id: roleB, organization_id: organizationB, code: "custom_admin", kind: "custom", status: "active", organization_role_permissions: [{ permission_code: "companies.read" }] },
    ] : path.endsWith("organizations") ? [organizationA, organizationB].map((id) => ({ id, legacy_tenant_id: actor, name: id, slug: id, status: "active", avatar_url: null, version: 1 })) : [];
    return Response.json(rows);
  });
  const directory = createOrganizationsDirectory({ url: "https://organizations.test", serviceRoleKey: "test-key" });
  const access = await directory.listAccessForUser(userId(actor));
  assert.deepEqual(access.map((entry) => entry.membership.permissions), [["members.read"], ["companies.read"]]);
  assert.equal(queried.some((path) => path.includes("shared_authorization_role_permissions")), false);
});

test("missing, archived and foreign assigned roles cannot expose an organization", async (context) => {
  let role: unknown = null;
  context.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    const path = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).pathname;
    const rows = path.endsWith("organization_memberships") ? [{ organization_id: organizationA, user_id: actor, role: "owner", role_id: roleA, status: "active" }]
      : path.endsWith("organization_roles") ? role ? [role] : []
      : [{ id: organizationA, legacy_tenant_id: actor, name: "Portal", slug: "portal", status: "active", avatar_url: null, version: 1 }];
    return Response.json(rows);
  });
  const directory = createOrganizationsDirectory({ url: "https://organizations.test", serviceRoleKey: "test-key" });
  assert.deepEqual(await directory.listAccessForUser(userId(actor)), []);
  role = { id: roleA, organization_id: organizationA, code: "owner", kind: "system", status: "archived", organization_role_permissions: [] };
  assert.deepEqual(await directory.listAccessForUser(userId(actor)), []);
  role = { id: roleA, organization_id: organizationB, code: "owner", kind: "system", status: "active", organization_role_permissions: [] };
  assert.deepEqual(await directory.listAccessForUser(userId(actor)), []);
  role = { id: roleA, organization_id: organizationA, code: "owner", kind: "system", status: "active", organization_role_permissions: [] };
  assert.deepEqual((await directory.listAccessForUser(userId(actor)))[0]?.membership.permissions, ["*"]);
});

test("a legacy owner label cannot bypass the actual assigned role grants", async (context) => {
  context.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    const path = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).pathname;
    return Response.json(path.endsWith("organization_memberships") ? [{ organization_id: organizationA, user_id: actor, role: "owner", role_id: roleA, status: "active" }]
      : path.endsWith("organization_roles") ? [{ id: roleA, organization_id: organizationA, code: "cashier", kind: "system", status: "active", organization_role_permissions: [{ permission_code: "sales.read" }] }]
      : [{ id: organizationA, legacy_tenant_id: actor, name: "Portal", slug: "portal", status: "active", avatar_url: null, version: 1 }]);
  });
  const directory = createOrganizationsDirectory({ url: "https://organizations.test", serviceRoleKey: "test-key" });
  assert.deepEqual((await directory.listAccessForUser(userId(actor)))[0]?.membership.permissions, ["sales.read"]);
});
