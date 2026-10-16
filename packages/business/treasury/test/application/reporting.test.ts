import assert from "node:assert/strict";
import test from "node:test";
import { renderTreasuryCsv, renderTreasuryPdf } from "../../src";
import { JsPdfTreasuryReportRenderer } from "../../src/adapters/pdf";

const snapshot = { title: "Bancos", generatedAt: "2026-09-30T00:00:00Z", columns: ["Cuenta", "Saldo"], rows: [{ Cuenta: "Banco, C.A.", Saldo: "10.00" }] };
test("CSV escapes report content while preserving exact serialized amounts", () => {
  assert.equal(renderTreasuryCsv(snapshot), "Cuenta,Saldo\r\n\"Banco, C.A.\",10.00");
});
test("PDF adapter receives the same authorized report snapshot", async () => {
  const document = await renderTreasuryPdf({ async renderPdf(value) { assert.equal(value, snapshot); return { mediaType: "application/pdf", bytes: new Uint8Array([1]), fileName: "bank.pdf" }; } }, snapshot);
  assert.equal(document.fileName, "bank.pdf");
});
test("jsPDF adapter emits a nonempty PDF document", async () => {
  const document = await new JsPdfTreasuryReportRenderer("treasury").renderPdf(snapshot);
  assert.equal(document.mediaType, "application/pdf"); assert.ok(document.bytes.byteLength > 100); assert.equal(document.fileName, "treasury.pdf");
});
