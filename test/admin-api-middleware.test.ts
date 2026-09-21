import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";

let barcodeAccess = { registered: false, active: true };
let tenantMatches = true;

mock.module("@supabase/ssr", {
    namedExports: {
        createServerClient: () => ({
            auth: { getUser: async () => ({ data: { user: { id: "admin-user" } } }) },
        }),
    },
});

mock.module("@/src/shared/backend/barcode/barcode-request-guard", {
    namedExports: {
        readBarcodeRequestAccess: async () => barcodeAccess,
        barcodeTenantMatches: () => tenantMatches,
        isBarcodeSessionRecoveryPath: () => false,
    },
});

const { middleware } = await import("../middleware");

function adminRequest(path: string) {
    return new NextRequest(`https://kont.test${path}`, {
        headers: { cookie: "kont-admin=1" },
    });
}

test("an active ordinary admin session can reach admin APIs and sign-out", async () => {
    barcodeAccess = { registered: false, active: true };
    tenantMatches = true;

    for (const path of [
        "/api/admin/summary",
        "/api/admin/tenants",
        "/api/admin/payment-requests",
        "/api/system-errors",
        "/api/admin/sign-out",
    ]) {
        const response = await middleware(adminRequest(path));
        assert.equal(response.status, 200, path);
        assert.equal(response.headers.get("location"), null, path);
        assert.equal(response.headers.get("x-middleware-next"), "1", path);
    }
});

test("an admin session still redirects from regular application pages", async () => {
    barcodeAccess = { registered: false, active: true };

    const response = await middleware(adminRequest("/payroll"));

    assert.equal(response.headers.get("location"), "https://kont.test/admin");
});

test("barcode API enforcement runs before the admin navigation exception", async () => {
    barcodeAccess = { registered: true, active: false };
    tenantMatches = true;
    const lockedResponse = await middleware(adminRequest("/api/admin/summary"));
    assert.equal(lockedResponse.status, 401);
    assert.deepEqual(await lockedResponse.json(), {
        error: "La sesi\u00f3n est\u00e1 bloqueada. Escanea tu carnet.",
        errorCode: "BARCODE_SESSION_LOCKED",
    });

    barcodeAccess = { registered: true, active: true };
    tenantMatches = false;
    const mismatchedResponse = await middleware(adminRequest("/api/admin/summary"));
    assert.equal(mismatchedResponse.status, 403);
    assert.deepEqual(await mismatchedResponse.json(), {
        error: "La terminal no tiene acceso a esta empresa.",
    });
});
