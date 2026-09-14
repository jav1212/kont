import assert from "node:assert/strict";
import test from "node:test";

const actor = "10000000-0000-4000-8000-000000000001";
const tenantA = "20000000-0000-4000-8000-000000000001";
const tenantB = "20000000-0000-4000-8000-000000000002";
const organizationA = "30000000-0000-4000-8000-000000000001";
const organizationB = "30000000-0000-4000-8000-000000000002";
const roleA = "40000000-0000-4000-8000-000000000001";

let state = { organization: "active", membership: "active", role: "active", permissions: ["companies.read"] as string[] };

/**
 * Mimics only the Supabase projections consumed by canonical Web authorization.
 *
 * @param input Supabase request URL.
 * @param init Fetch options supplied by the Supabase clients.
 * @returns A deterministic service-role response with no network I/O.
 */
const supabaseFetch: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const table = url.pathname.split("/").at(-1);
    const tenantId = url.searchParams.get("legacy_tenant_id")?.replace("eq.", "") ?? tenantA;
    const organizationId = tenantId === tenantB ? organizationB : organizationA;

    if (table === "organizations") {
        return Response.json(state.organization === "active" ? { id: organizationId, legacy_tenant_id: tenantId, status: "active" } : null);
    }
    if (table === "organization_memberships") {
        return Response.json({
            id: "50000000-0000-4000-8000-000000000001",
            status: state.membership,
            authorization_version: 1,
            organization_id: organizationId,
            organizations: { status: state.organization },
            organization_roles: {
                id: roleA,
                organization_id: organizationId,
                code: "cashier",
                name: "Cajero",
                description: "",
                kind: "system",
                status: state.role,
                version: 1,
                organization_role_permissions: state.permissions.map((permission_code) => ({ permission_code })),
            },
        });
    }
    if (table === "organization_authorization_audit" || table === "shared_authorization_audit") {
        return Response.json(null, { status: 201 });
    }
    throw new Error(`Unexpected Supabase table ${table}`);
};

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://canonical-auth.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
globalThis.fetch = supabaseFetch;

const { PermissionDeniedError, legacyRoleFromCanonical, requirePermission } = await import("../src/shared/backend/utils/require-tenant");
type TenantContext = import("../src/shared/backend/utils/require-tenant").TenantContext;

/**
 * Builds a context whose legacy role may be forged or stale; canonical data is authoritative.
 *
 * @param tenantId Tenant selected by the legacy bridge.
 * @returns Context accepted by the permission boundary.
 */
function context(tenantId = tenantA): TenantContext {
    return {
        userId: actor,
        tenantId,
        schemaName: `tenant_${tenantId.replaceAll("-", "")}`,
        actingAs: null,
        role: "owner",
        effectiveOwnerId: tenantId,
    };
}

test("a forged legacy owner label cannot obtain payroll access from a canonical cashier role", async () => {
    state = { organization: "active", membership: "active", role: "active", permissions: ["companies.read"] };
    await assert.rejects(() => requirePermission(context(), "payroll.read"), PermissionDeniedError);
});

test("canonical role mapping cannot retain a stale legacy owner privilege", () => {
    assert.equal(legacyRoleFromCanonical("cashier"), "cajero");
    assert.equal(legacyRoleFromCanonical("custom_shift_lead"), "cajero");
});

test("the canonical cashier role grants only its assigned read capability", async () => {
    state = { organization: "active", membership: "active", role: "active", permissions: ["companies.read"] };
    await requirePermission(context(), "companies.read");
    await assert.rejects(() => requirePermission(context(), "employees.read"), PermissionDeniedError);
});

test("editing a system role's permissions takes effect on subsequent Web requests", async () => {
    state = { organization: "active", membership: "active", role: "active", permissions: ["companies.read"] };
    await assert.rejects(() => requirePermission(context(), "sales.create"), PermissionDeniedError);

    state.permissions = ["companies.read", "sales.create"];
    await requirePermission(context(), "sales.create");

    state.permissions = ["companies.read"];
    await assert.rejects(() => requirePermission(context(), "sales.create"), PermissionDeniedError);
});

test("suspended organization, inactive membership, or archived role fails closed", async () => {
    for (const next of [
        { organization: "suspended", membership: "active", role: "active" },
        { organization: "active", membership: "suspended", role: "active" },
        { organization: "active", membership: "active", role: "archived" },
    ]) {
        state = { ...next, permissions: ["companies.read"] };
        await assert.rejects(() => requirePermission(context(), "companies.read"), PermissionDeniedError);
    }
});

test("a second organization cannot inherit a permission granted only in the first", async () => {
    state = { organization: "active", membership: "active", role: "active", permissions: ["companies.read"] };
    await requirePermission(context(tenantA), "companies.read");
    state = { organization: "active", membership: "active", role: "active", permissions: [] };
    await assert.rejects(() => requirePermission(context(tenantB), "companies.read"), PermissionDeniedError);
});
