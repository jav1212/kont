import assert from "node:assert/strict";
import test from "node:test";

const actor = "10000000-0000-4000-8000-000000000001";
const tenantA = "20000000-0000-4000-8000-000000000001";
const tenantB = "20000000-0000-4000-8000-000000000002";
const organizationA = "30000000-0000-4000-8000-000000000001";
const organizationB = "30000000-0000-4000-8000-000000000002";
const roleA = "40000000-0000-4000-8000-000000000001";
const roleB = "40000000-0000-4000-8000-000000000002";
let organizationBAvatarUrl: string | null = "https://avatar.test/b-explicit.png";

const requests: Array<{ readonly method: string; readonly path: string; readonly search: string }> = [];

/**
 * Serves the exact Supabase projections used by the Web organization boundary.
 * It is installed before importing the boundary because ServerSupabaseSource
 * captures fetch during module evaluation.
 *
 * @param input Supabase request URL.
 * @param init Supabase request options.
 * @returns A deterministic service-role response without network I/O.
 */
const supabaseFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url);
  requests.push({ method: request.method, path: url.pathname, search: url.search });

  const table = url.pathname.split("/").at(-1);
  if (table === "organization_memberships") {
    const select = url.searchParams.get("select") ?? "";
    if (select.includes("authorization_version")) {
      const organizationId = url.searchParams.get("organization_id")?.replace("eq.", "");
      const row = snapshot(organizationId === organizationB ? organizationB : organizationA);
      return Response.json(row);
    }
    if (url.searchParams.get("role") === "eq.owner") return Response.json([
      { organization_id: organizationA, user_id: "60000000-0000-4000-8000-000000000001" },
      { organization_id: organizationB, user_id: "60000000-0000-4000-8000-000000000002" },
    ]);
    return Response.json([
      membership(organizationA, roleA),
      membership(organizationB, roleB),
    ]);
  }
  if (table === "organizations") {
    return Response.json([
      organization(organizationA, tenantA),
      organization(organizationB, tenantB),
    ]);
  }
  if (table === "profiles") throw new Error("Web organization projections must not query personal profiles.");
  if (table === "organization_roles") {
    return Response.json([
      assignedRole(organizationA, roleA),
      assignedRole(organizationB, roleB),
    ]);
  }
  if (table === "tenants") return Response.json([]);
  if (table === "tenant_memberships") return Response.json([{ tenant_id: tenantA }, { tenant_id: tenantB }]);
  if (table === "organization_authorization_audit") return Response.json(null, { status: 201 });
  if (table === "update_organization_native") {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as { p_organization_id: string; p_name?: string; p_logo_url?: string | null; p_update_name: boolean; p_update_logo_url: boolean } : null;
    if (!body) throw new Error("Organization updates must include their command payload.");
    const current = organization(body.p_organization_id, tenantB);
    return Response.json({
      ...current,
      name: body.p_update_name ? body.p_name : current.name,
      avatar_url: body.p_update_logo_url ? body.p_logo_url : current.avatar_url,
      version: 2,
    });
  }
  if (table === "list_organization_members_native") {
    throw new Error("The member RPC must not run without members.read.");
  }
  throw new Error(`Unexpected Supabase request: ${request.method} ${url.pathname}`);
};

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://organizations.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
globalThis.fetch = supabaseFetch;

const { createWebOrganizationActions } = await import("../src/modules/organizations/backend/web-organization-actions");
const { TenantForbiddenError } = await import("../src/shared/backend/utils/require-tenant");
const { workspaceSchema } = await import("../src/modules/organizations/contracts");
type TenantContext = import("../src/shared/backend/utils/require-tenant").TenantContext;

/**
 * Builds the active, terminal-bound tenant context used by the Web boundary.
 *
 * @returns A context that may only operate in tenant A.
 */
function barcodeTenantContext(): TenantContext {
  return {
    userId: actor,
    tenantId: tenantA,
    schemaName: "tenant_20000000000040008000000000000001",
    actingAs: { ownerId: tenantA, role: "cajero" },
    role: "cajero",
    effectiveOwnerId: tenantA,
    barcodeSession: true,
  };
}

/**
 * Builds a membership row for the shared organization adapter.
 *
 * @param organizationId Organization containing the membership.
 * @param roleId Assigned organization-local role.
 * @returns Persisted active membership data.
 */
function membership(organizationId: string, roleId: string) {
  return { organization_id: organizationId, user_id: actor, role: "cashier", role_id: roleId, status: "active" };
}

/**
 * Builds an active legacy-linked organization row.
 *
 * @param id Organization identifier.
 * @param legacyTenantId Legacy tenant bridge.
 * @returns Persisted organization data.
 */
function organization(id: string, legacyTenantId: string) {
  return {
    id,
    legacy_tenant_id: legacyTenantId,
    name: `Organization ${id}`,
    slug: `organization-${id.slice(0, 8)}`,
    status: "active",
    avatar_url: id === organizationB ? organizationBAvatarUrl : null,
    version: 1,
  };
}

/**
 * Builds the assigned role relation used by both the directory and authorization snapshot.
 *
 * @param organizationId Owning organization.
 * @param id Role identifier.
 * @returns An active role intentionally lacking members.read.
 */
function assignedRole(organizationId: string, id: string) {
  return {
    id,
    organization_id: organizationId,
    code: "cashier",
    name: "Cajero",
    description: "",
    kind: "system",
    status: "active",
    version: 1,
    organization_role_permissions: [
      { permission_code: "companies.read" },
      ...(organizationId === organizationB ? [{ permission_code: "organizations.update" }] : []),
    ],
  };
}

/**
 * Builds the nested membership query response used by the authorization adapter.
 *
 * @param organizationId Requested organization.
 * @returns An active authorization snapshot for the actor.
 */
function snapshot(organizationId: string) {
  return {
    id: `50000000-0000-4000-8000-00000000000${organizationId === organizationA ? "1" : "2"}`,
    status: "active",
    authorization_version: 1,
    organization_id: organizationId,
    organizations: { status: "active" },
    organization_roles: assignedRole(organizationId, organizationId === organizationA ? roleA : roleB),
  };
}

test("a barcode session lists only its enrolled tenant organization and denies a mismatched target", async () => {
  requests.length = 0;
  const actions = createWebOrganizationActions(new Request("https://web.test/api/organizations"), barcodeTenantContext());

  const workspaces = await actions.list();
  assert.deepEqual(workspaces.map((workspace) => workspace.id), [organizationA]);
  assert.equal(workspaces[0]?.avatarUrl, null);
  assert.equal(requests.some((request) => request.path.endsWith("/profiles")), false);
  await assert.rejects(() => actions.workspace(organizationB), TenantForbiddenError);
});

test("a member lacking members.read is denied before the native members RPC", async () => {
  requests.length = 0;
  const actions = createWebOrganizationActions(new Request("https://web.test/api/organizations"), barcodeTenantContext());

  await assert.rejects(() => actions.members(organizationA));
  assert.equal(requests.some((request) => request.path.endsWith("/rpc/list_organization_members_native")), false);
});

test("a normal session can enumerate its organizations but cannot operate on an unselected tenant", async () => {
  const actions = createWebOrganizationActions(new Request("https://web.test/api/organizations"), {
    ...barcodeTenantContext(),
    barcodeSession: false,
  });

  const workspaces = await actions.list();
  assert.deepEqual(workspaces.map((workspace) => workspace.id), [organizationA, organizationB]);
  assert.deepEqual(workspaces.map((workspace) => workspace.avatarUrl), [
    null,
    "https://avatar.test/b-explicit.png",
  ]);
  assert.equal(requests.some((request) => request.path.endsWith("/profiles")), false);
  await assert.rejects(() => actions.workspace(organizationB), TenantForbiddenError);
});

test("the additive workspace avatar remains compatible with responses produced before presentation support", () => {
  const legacyWorkspace = workspaceSchema.parse({
    id: organizationA,
    name: "Organization A",
    slug: "organization-a",
    logoUrl: null,
    version: 1,
    role: "cashier",
    permissions: [],
    legacyTenantId: tenantA,
  });

  assert.equal(legacyWorkspace.avatarUrl, undefined);
});

test("an organization without explicit branding keeps a null presentation even when its owner has a personal image", async () => {
  organizationBAvatarUrl = null;
  try {
    const actions = createWebOrganizationActions(new Request("https://web.test/api/organizations"), {
      ...barcodeTenantContext(),
      barcodeSession: false,
    });
    const workspaces = await actions.list();
    assert.equal(workspaces.find((workspace) => workspace.id === organizationB)?.avatarUrl, null);
  } finally {
    organizationBAvatarUrl = "https://avatar.test/b-explicit.png";
  }
});

test("organization writes keep the Web avatar synchronized with explicit branding", async () => {
  const actions = createWebOrganizationActions(new Request("https://web.test/api/organizations"), {
    ...barcodeTenantContext(),
    tenantId: tenantB,
    barcodeSession: true,
  });

  const renamed = await actions.update(organizationB, { name: "Updated organization", expectedVersion: 1 });
  assert.equal(renamed.logoUrl, "https://avatar.test/b-explicit.png");
  assert.equal(renamed.avatarUrl, renamed.logoUrl);

  const withoutLogo = await actions.deleteLogo(organizationB, 1);
  assert.equal(withoutLogo.logoUrl, null);
  assert.equal(withoutLogo.avatarUrl, null);
  assert.equal(requests.some((request) => request.path.endsWith("/profiles")), false);
});
