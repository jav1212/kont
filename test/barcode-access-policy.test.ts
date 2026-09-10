import assert from "node:assert/strict";
import test from "node:test";
import { isBadgeBarcode, mayDeliverRawBridgeScan } from "@/src/shared/frontend/devices/barcode-access-policy";

test("only the reserved exact badge prefix is classified as an access credential", () => {
    assert.equal(isBadgeBarcode("KONT-aZ09_-QwErTyUiOp"), true);
    assert.equal(isBadgeBarcode("KONT-"), true);
    assert.equal(isBadgeBarcode("kont-aZ09"), false);
    assert.equal(isBadgeBarcode("7501234567890"), false);
});

test("legacy Bridge broadcasts cannot bypass access capture or leak a badge", () => {
    assert.equal(mayDeliverRawBridgeScan(true, "7501234567890"), false);
    assert.equal(mayDeliverRawBridgeScan(false, "KONT-aZ09_-QwErTyUiOp"), false);
    assert.equal(mayDeliverRawBridgeScan(false, "7501234567890"), true);
});
