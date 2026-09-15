import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inferPermissionFromRequest, withTenantPermissions } from "@/src/shared/backend/utils/require-tenant";
import { hasRegisteredWebApiRoute } from "@/src/modules/organizations/backend/web-api-route-access";

/**
 * Builds an API request without cookies or persistence because permission
 * inference is a pure compatibility policy.
 *
 * @param path API pathname under test.
 * @param method HTTP method used by the route.
 * @returns A request suitable for the inference boundary.
 */
function request(path: string, method: string): Request {
    return new Request(`https://web.test${path}`, { method });
}

test("maps legacy operations to permissions that exist in the canonical catalog", () => {
    assert.equal(inferPermissionFromRequest(request("/api/payroll/settings", "PUT")), "payroll.create");
    assert.equal(inferPermissionFromRequest(request("/api/inventory/movements/draft/id/confirm", "POST")), "inventory.update");
    assert.equal(inferPermissionFromRequest(request("/api/purchases/id", "DELETE")), "purchases.create");
    assert.equal(inferPermissionFromRequest(request("/api/sales/id/unconfirm", "POST")), "sales.cancel");
});

test("does not silently permit an unknown withTenant resource", () => {
    assert.equal(inferPermissionFromRequest(request("/api/future-module/records", "GET")), "authorization.denied");
    assert.equal(inferPermissionFromRequest(request("/api/access/future-operation", "POST")), "authorization.denied");
    assert.equal(inferPermissionFromRequest(request("/api/authorization/future-operation", "GET")), "authorization.denied");
    assert.equal(inferPermissionFromRequest(request("/api/billing/tenant/payment-data", "GET")), "authorization.denied");
    assert.equal(inferPermissionFromRequest(request("/api/inventory/future-operation", "POST")), "authorization.denied");
    assert.equal(inferPermissionFromRequest(request("/api/inventory/report", "POST")), "authorization.denied");
});

test("new static API handlers cannot hide behind a dynamic route declaration", () => {
    assert.equal(hasRegisteredWebApiRoute("GET", "/api/purchases/[id]"), true);
    assert.equal(hasRegisteredWebApiRoute("GET", "/api/purchases/new-sensitive-report"), false);
    assert.equal(hasRegisteredWebApiRoute("PATCH", "/api/purchases/[id]"), false);
});

test("an explicit permission wrapper cannot be configured with an empty grant list", () => {
    assert.throws(() => withTenantPermissions([], async () => Response.json({ data: [] })), TypeError);
});

test("preserves explicit personal and organization boundary routes outside generic inference", () => {
    assert.equal(inferPermissionFromRequest(request("/api/seniat-reminders/list", "GET")), null);
    assert.equal(inferPermissionFromRequest(request("/api/billing/capacity", "GET")), null);
    assert.equal(inferPermissionFromRequest(request("/api/access/terminals", "POST")), "access.manage");
    assert.equal(inferPermissionFromRequest(request("/api/access/badges/batch", "POST")), "access.manage");
});

test("legacy upserts require both creation and update authority until their contracts split", () => {
    for (const route of [
        "app/api/employees/upsert/route.ts",
        "app/api/companies/save/route.ts",
        "app/api/sales/customers/route.ts",
    ]) {
        const source = readFileSync(route, "utf8");
        assert.match(source, /withTenantPermissions\([\s\S]*?(?:employees|companies|sales)\.create[\s\S]*?(?:employees|companies|sales)\.update/);
    }
    const sectorSource = readFileSync("app/api/companies/apply-sector/route.ts", "utf8");
    assert.match(sectorSource, /withTenantPermission\(['"]companies\.update['"]/);
});

test("sensitive legacy routes declare their exact canonical permission instead of inferring it", () => {
    const expectations: ReadonlyArray<readonly [string, string]> = [
        ["app/api/authorization/roles/route.ts", "roles.read"],
        ["app/api/authorization/roles/route.ts", "roles.manage"],
        ["app/api/sales/[id]/route.ts", "sales.update"],
        ["app/api/sales/[id]/route.ts", "sales.cancel"],
        ["app/api/sales/customers/[id]/route.ts", "sales.update"],
        ["app/api/companies/inventory-config/route.ts", "companies.read"],
        ["app/api/companies/inventory-config/route.ts", "companies.update"],
        ["app/api/billing/payment-requests/route.ts", "billing.read"],
        ["app/api/billing/payment-requests/route.ts", "billing.manage"],
        ["app/api/referrals/me/route.ts", "referrals.read"],
        ["app/api/referrals/available-credit/route.ts", "referrals.read"],
    ];
    for (const [route, permission] of expectations) {
        assert.match(readFileSync(route, "utf8"), new RegExp(`withTenantPermission\\(['\"]${permission}['\"]`));
    }
});

test("role settings use organization-scoped versioned actions and never the global role table", () => {
    const source = readFileSync("app/api/authorization/roles/route.ts", "utf8");
    assert.doesNotMatch(source, /shared_authorization_role_permissions/);
    assert.match(source, /withTenantPermission\("roles\.manage"/);
    assert.match(source, /authorization\.actions\.updateRole\.execute/);
    assert.match(source, /organizationId: authorization\.organizationId/);
    assert.match(source, /expectedVersion: body\.expectedVersion/);
});
