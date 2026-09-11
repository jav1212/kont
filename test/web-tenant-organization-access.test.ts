import assert from "node:assert/strict";
import test from "node:test";
import { resolveActiveLegacyTenant } from "@/src/shared/backend/utils/tenant-organization-access";
import { SupabaseMembershipsRepository } from "@/src/modules/memberships/backend/infrastructure/repositories/supabase-memberships.repository";
import type { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";

const cashier = "10000000-0000-4000-8000-000000000001";
const suspendedOwnTenant = cashier;
const portalTenant = "20000000-0000-4000-8000-000000000001";

const memberships = [{ tenantId: portalTenant, role: "cajero" }];
const activePortalOnly = new Set([portalTenant]);

/**
 * Supplies the common access state for a user whose accidental own workspace is suspended.
 *
 * @param overrides Selection values that vary per authorization case.
 * @returns A complete resolver input without any persistence dependency.
 */
function accessInput(overrides: Partial<Parameters<typeof resolveActiveLegacyTenant>[0]> = {}) {
    return {
        userId: cashier,
        requestedTenantId: null,
        barcodeTenantId: null,
        ownsRequestedTenant: true,
        memberships,
        activeOrganizationTenantIds: activePortalOnly,
        ...overrides,
    };
}

test("an absent tenant header skips a suspended own workspace and bootstraps the active Portal membership", () => {
    assert.deepEqual(resolveActiveLegacyTenant(accessInput()), {
        tenantId: portalTenant,
        role: "cajero",
        isOwner: false,
    });
});

test("an explicit suspended own-tenant header is denied instead of falling back to Portal", () => {
    assert.equal(resolveActiveLegacyTenant(accessInput({ requestedTenantId: suspendedOwnTenant })), null);
});

test("a barcode-pinned suspended tenant is denied instead of falling back to Portal", () => {
    assert.equal(resolveActiveLegacyTenant(accessInput({ barcodeTenantId: suspendedOwnTenant })), null);
});

test("an explicit active Portal tenant keeps the legacy cashier role", () => {
    assert.deepEqual(resolveActiveLegacyTenant(accessInput({ requestedTenantId: portalTenant })), {
        tenantId: portalTenant,
        role: "cajero",
        isOwner: false,
    });
});

test("an active own tenant remains an owner context", () => {
    assert.deepEqual(resolveActiveLegacyTenant(accessInput({
        memberships: [],
        activeOrganizationTenantIds: new Set([cashier]),
    })), {
        tenantId: cashier,
        role: "owner",
        isOwner: true,
    });
});

/**
 * Exercises the production directory adapter with a suspended own-workspace fixture.
 * @param failOrganizationRead Whether the organization query reports a persistence failure.
 * @returns The repository and observed Auth lookups; no network calls are made.
 */
function directoryFixture(failOrganizationRead: boolean) {
    const authLookups: string[] = [];
    const responses: Record<string, unknown[]> = {
        tenant_memberships: [
            { tenant_id: cashier, role: "owner", accepted_at: "2026-01-01T00:00:00Z" },
            { tenant_id: portalTenant, role: "cajero", accepted_at: "2026-01-02T00:00:00Z" },
        ],
        organizations: [{ legacy_tenant_id: portalTenant }],
        profiles: [],
        shared_authorization_role_permissions: [{ role: "cajero", permission_code: "sales.read" }],
    };
    const source = {
        from(table: string) {
            assert.ok(table in responses);
            const filters: unknown[][] = [];
            const query = {
                select: () => query,
                eq: (...args: unknown[]) => { filters.push(args); return query; },
                not: () => query,
                is: () => query,
                order: () => query,
                in: () => query,
                then(resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) {
                    if (table === "organizations") assert.ok(filters.some(([key, value]) => key === "status" && value === "active"));
                    return Promise.resolve({
                        data: responses[table],
                        error: table === "organizations" && failOrganizationRead ? { message: "unavailable" } : null,
                    }).then(resolve, reject);
                },
            };
            return query;
        },
        auth: { admin: { async getUserById(id: string) {
            authLookups.push(id);
            return { data: { user: { email: "workspace@example.invalid" } } };
        } } },
    };
    return {
        repository: new SupabaseMembershipsRepository({ instance: source } as unknown as ServerSupabaseSource),
        authLookups,
    };
}

test("the actual membership directory excludes suspended owner access before loading its identity", async () => {
    const { repository, authLookups } = directoryFixture(false);
    const result = await repository.getUserMemberships(cashier);
    assert.equal(result.isSuccess, true);
    assert.deepEqual(result.getValue().map(({ tenantId, role, isOwn, permissions }) => ({ tenantId, role, isOwn, permissions })), [
        { tenantId: portalTenant, role: "cajero", isOwn: false, permissions: ["sales.read"] },
    ]);
    assert.deepEqual(authLookups, [portalTenant]);
});

test("an organization-directory failure cannot return unfiltered owner permissions", async () => {
    const { repository, authLookups } = directoryFixture(true);
    assert.equal((await repository.getUserMemberships(cashier)).isFailure, true);
    assert.deepEqual(authLookups, []);
});
