import assert from "node:assert/strict";
import test from "node:test";
import { createSupabaseAuthorization } from "../../src/adapters/supabase";

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "00000000-0000-4000-8000-000000000002";
const ROLE_ID = "00000000-0000-4000-8000-000000000003";

test("authorization snapshots ignore unknown persisted permissions without expanding access", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json({
      id: MEMBERSHIP_ID,
      status: "active",
      authorization_version: 1,
      organization_id: ORGANIZATION_ID,
      organizations: { status: "active" },
      organization_roles: {
        id: ROLE_ID,
        organization_id: ORGANIZATION_ID,
        code: "owner",
        name: "Owner",
        description: "",
        kind: "system",
        status: "active",
        version: 1,
        organization_role_permissions: [
          { permission_code: "organizations.read" },
          { permission_code: "future.permission" },
          { permission_code: "*" },
        ],
      },
    }),
  );

  const snapshot = await createSupabaseAuthorization({
    url: "https://access.test",
    serviceRoleKey: "service-key",
  }).repository.findSnapshot("user", ORGANIZATION_ID);

  assert.deepEqual(snapshot?.role.permissions, ["organizations.read"]);
});

test("permission administration omits persisted permissions unknown to this client", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json([
      { code: "organizations.read", resource: "organizations", action: "read", description: "Read" },
      { code: "future.permission", resource: "future", action: "permission", description: "Future" },
    ]),
  );

  const permissions = await createSupabaseAuthorization({
    url: "https://access.test",
    serviceRoleKey: "service-key",
  }).administration.listPermissions();

  assert.deepEqual(permissions.map((permission) => permission.code), ["organizations.read"]);
});
