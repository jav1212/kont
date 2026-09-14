import assert from "node:assert/strict";
import test from "node:test";
import { createAccessBadgePdf } from "../src/modules/auth/frontend/access-badge-pdf";

test("badge PDF never embeds a readable credential or scanner instructions", () => {
    const barcode = "KONT-0123456789abcdefghijkl";
    const pdf = createAccessBadgePdf({ barcode, email: "cajero@example.test" });
    const output = pdf.output();
    assert.equal(pdf.getNumberOfPages(), 1);
    assert.ok(output.startsWith("%PDF-"));
    assert.ok(output.includes("cajero@example.test"));
    assert.equal(output.includes(barcode), false);
    assert.equal(output.includes("KONT-"), false);
    assert.equal(output.toLowerCase().includes("escanear"), false);
});

test("a long holder email fits a single printable badge", () => {
    const email = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.example.test`;
    const pdf = createAccessBadgePdf({ barcode: "KONT-0123456789abcdefghijkl", email });
    assert.equal(pdf.getNumberOfPages(), 1);
});

test("PDF rejects invalid credentials without disclosing their values", () => {
    assert.throws(() => createAccessBadgePdf({ barcode: "private-invalid-value", email: null }), {
        name: "TypeError", message: "El código del carnet no es válido.",
    });
});
