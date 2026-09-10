import assert from "node:assert/strict";
import test from "node:test";
import { BarcodeOperation } from "./barcode-operation";

test("infrastructure failures never disclose provider tokens or database details", async () => {
    const operation = new BarcodeOperation(async () => { throw new Error("provider failure containing secret material"); });
    const result = await operation.execute(undefined);
    assert.equal(result.isFailure, true);
    assert.equal(result.getError(), "barcode_operation_failed");
});

test("expected membership denial remains distinguishable without granting a credential", async () => {
    const operation = new BarcodeOperation(async () => { throw new Error("badge_user_not_member"); });
    assert.equal((await operation.execute(undefined)).getError(), "badge_user_not_member");
});
