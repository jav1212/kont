import assert from "node:assert/strict";
import test from "node:test";
import { barcodeTenantMatches, isBarcodeSessionRecoveryPath } from "./barcode-request-guard";
import { requireAccessAdministrator } from "./require-access-administrator";
import type { TenantContext } from "../utils/require-tenant";
import { ServerSupabaseSource } from "../source/infra/server-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const MEMBERSHIP_ID = "22222222-2222-4222-8222-222222222222";
const ROLE_ID = "33333333-3333-4333-8333-333333333333";

/** Installs the server and canonical-access responses needed by this authorization boundary. */
function mockCanonicalAccess(t: test.TestContext, permissions: readonly string[]): { readonly sharedAuditCalls: () => number } {
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
    t.after(() => {
        if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
        if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    });

    const organizationQuery = {
        select: () => organizationQuery,
        eq: () => organizationQuery,
        maybeSingle: async () => ({ data: { id: ORGANIZATION_ID, legacy_tenant_id: "a", status: "active" }, error: null }),
    };
    let sharedAuditCalls = 0;
    const auditQuery = { insert: async () => { sharedAuditCalls += 1; return { error: null }; } };
    t.mock.method(ServerSupabaseSource.prototype, "connect", () => ({
        from: (table: string) => {
            if (table === "organizations") return organizationQuery;
            if (table === "shared_authorization_audit") return auditQuery;
            throw new Error(`Unexpected server table: ${table}`);
        },
    }) as unknown as SupabaseClient);

    t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.pathname.endsWith("/organization_memberships")) {
            return Response.json([{
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
                    organization_role_permissions: permissions.map((permission_code) => ({ permission_code })),
                },
            }]);
        }
        if (url.pathname.endsWith("/organization_authorization_audit")) return new Response(null, { status: 201 });
        throw new Error(`Unexpected canonical request: ${url.pathname}`);
    });
    return { sharedAuditCalls: () => sharedAuditCalls };
}

test("a terminal session cannot select another tenant through a header or URL", () => {
    const access = { registered: true, active: true, tenantId: "tenant-a" };
    assert.equal(barcodeTenantMatches(access, "tenant-a", null), true);
    assert.equal(barcodeTenantMatches(access, "tenant-a", "tenant-b"), false);
    assert.equal(barcodeTenantMatches({ ...access, active: false }), false);
    assert.equal(barcodeTenantMatches({ registered: false, active: false }, "tenant-b"), true);
});

test("recovery exemptions cannot be used as API prefixes", () => {
    assert.equal(isBarcodeSessionRecoveryPath("/api/auth/barcode/lock"), true);
    assert.equal(isBarcodeSessionRecoveryPath("/api/auth/barcode/lock/anything"), false);
    assert.equal(isBarcodeSessionRecoveryPath("/api/access/terminals"), false);
});

test("credential administration accepts barcode owners and administrators only with canonical access.manage", async (t) => {
    const audit = mockCanonicalAccess(t, ["access.manage"]);
    const tenant: TenantContext = { userId: "a", tenantId: "a", effectiveOwnerId: "a", schemaName: "tenant_a", actingAs: null, role: "owner", barcodeSession: true };
    const get = new Request("https://kont.example/api/access/terminals");
    const post = new Request("https://kont.example/api/access/terminals", { method: "POST" });
    for (const barcodeSession of [true, false]) {
        for (const role of ["owner", "admin"] as const) {
            await requireAccessAdministrator({ ...tenant, barcodeSession, role }, get);
            await requireAccessAdministrator({ ...tenant, barcodeSession, role }, post);
        }
    }
    assert.equal(audit.sharedAuditCalls(), 4, "Only authorized mutations write the legacy permission audit.");
    for (const barcodeSession of [true, false]) {
        await assert.rejects(requireAccessAdministrator({ ...tenant, barcodeSession, role: "cajero" }, get), /Sin acceso/);
    }
});

test("credential administration denies owners without canonical access.manage", async (t) => {
    const audit = mockCanonicalAccess(t, []);
    const tenant: TenantContext = { userId: "a", tenantId: "a", effectiveOwnerId: "a", schemaName: "tenant_a", actingAs: null, role: "owner", barcodeSession: true };
    for (const barcodeSession of [true, false]) {
        await assert.rejects(requireAccessAdministrator({ ...tenant, barcodeSession }, new Request("https://kont.example/api/access/terminals")), /Permiso requerido: access.manage/);
    }
    assert.equal(audit.sharedAuditCalls(), 2, "Permission denials remain auditable for both login methods.");
});
