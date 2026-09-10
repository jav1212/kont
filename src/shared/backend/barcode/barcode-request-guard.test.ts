import assert from "node:assert/strict";
import test from "node:test";
import { barcodeTenantMatches, isBarcodeSessionRecoveryPath } from "./barcode-request-guard";
import { requireAccessAdministrator } from "./require-access-administrator";
import type { TenantContext } from "../utils/require-tenant";

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

test("credential administration rejects carnet sessions even for an owner", async () => {
    const tenant: TenantContext = { userId: "a", tenantId: "a", effectiveOwnerId: "a", schemaName: "tenant_a", actingAs: null, role: "owner", barcodeSession: true };
    const request = new Request("https://kont.example/api/access/terminals");
    await assert.rejects(requireAccessAdministrator(tenant, request), /Sin acceso/);
    await assert.rejects(requireAccessAdministrator({ ...tenant, barcodeSession: false, role: "cajero" }, request), /Sin acceso/);
    await requireAccessAdministrator({ ...tenant, barcodeSession: false }, request);
});
