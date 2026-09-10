import assert from "node:assert/strict";
import test from "node:test";
import { mustLeaveForBarcodeSession, reconcileBarcodeSession, shouldReportBarcodeActivity } from "@/src/modules/auth/frontend/barcode-session-policy";

test("ordinary sessions are not redirected by a barcode lock event", () => {
    assert.equal(mustLeaveForBarcodeSession({ registered: false, active: false }), false);
});

test("known expired barcode sessions leave before application content renders", () => {
    assert.equal(mustLeaveForBarcodeSession({ registered: true, active: false, sessionId: "session-a" }), true);
    assert.equal(mustLeaveForBarcodeSession({ registered: true, active: true }), true);
    assert.equal(mustLeaveForBarcodeSession({ registered: true, active: true, sessionId: "session-a" }), false);
});

test("only trusted and debounced activity can refresh barcode access", () => {
    assert.equal(shouldReportBarcodeActivity(false, 40_000, 0, 30_000), false);
    assert.equal(shouldReportBarcodeActivity(true, 29_999, 0, 30_000), false);
    assert.equal(shouldReportBarcodeActivity(true, 30_000, 0, 30_000), true);
});

test("an old tab reloads for a replacement session and never locks it", () => {
    assert.equal(reconcileBarcodeSession("session-a", { registered: true, active: true, sessionId: "session-a" }), "active");
    assert.equal(reconcileBarcodeSession("session-a", { registered: true, active: true, sessionId: "session-b" }), "changed");
    assert.equal(reconcileBarcodeSession("session-a", { registered: true, active: false, sessionId: "session-a" }), "expired");
});
