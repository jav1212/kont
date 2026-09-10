import assert from "node:assert/strict";
import test from "node:test";
import JsBarcode from "jsbarcode";

interface Code128Encoder {
    new (value: string, options: Record<string, unknown>): { encode(): { data: string } };
}

const Code128 = (JsBarcode as unknown as { getModule(name: "CODE128"): Code128Encoder }).getModule("CODE128");

test("badge credentials encode with Code 128 start, checksum and stop symbols", () => {
    const encoded = new Code128("KONT-Ab_9", {}).encode().data;

    // Code Set B start (104) and Code 128 stop (106) are fixed sentinels.
    assert.ok(encoded.startsWith("11010010000"));
    assert.ok(encoded.endsWith("1100011101011"));
    // This fixture fixes the content between those sentinels, including checksum.
    assert.equal(encoded, "11010010000101100011101000111011010111000110110111000101001101110010100011000100100001101010011000011100101100100111101001100011101011");
});

test("barcode access alphabet including URL-safe random data is Code 128 encodable", () => {
    const encoded = new Code128("KONT-aZ09_-QwErTyUiOp", {}).encode().data;
    assert.ok(encoded.length > 100);
    assert.ok(encoded.endsWith("1100011101011"));
});
