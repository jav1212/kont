import assert from "node:assert/strict";
import test from "node:test";
import { TaxReportingFailure } from "../../src/domain";
import { buildVatRetentionTxt, defaultVatRetentionTxtFilename, encodeVatRetentionTxtLatin1 } from "../../src/application/vat-retention-txt";
import type { VatRetentionExportRow } from "../../src/domain/vat-retention-export";

const row: VatRetentionExportRow = {
  agentRif: "J-12345678-9", periodYyyymm: "202609", date: "2026-09-15", operationType: "C", documentType: "01",
  supplierRif: "J-98765432-1", supplierName: "Proveedor", invoiceNumber: "F-1\tA", controlNumber: "C-1",
  taxableBase: 100, vatRate: 16, vatAmount: 16, vatWithheld: 12, lineTotal: 116, exemptAmount: 0,
  voucherNumber: "20260900000001", affectedDocument: "0", fileNumber: "0",
};

test("retention TXT renders the declared columns, sanitizes text, and supports the zero row", () => {
  const lines = buildVatRetentionTxt({ agentRif: row.agentRif, periodYyyymm: row.periodYyyymm, rows: [row] }).trimEnd().split("\n");
  const tokens = lines[0]!.split("\t");
  assert.equal(tokens.length, 17);
  assert.equal(tokens[1], "J123456789");
  assert.equal(tokens[7], "F-1 A");
  assert.equal(tokens[10], "100.00");
  assert.equal(tokens[11], "12.00");
  assert.equal(buildVatRetentionTxt({ agentRif: row.agentRif, periodYyyymm: row.periodYyyymm, rows: [] }).trimEnd().split("\t").length, 17);
  assert.equal(defaultVatRetentionTxtFilename(row.agentRif, row.periodYyyymm), "RetIVA_J123456789_202609.txt");
});

test("retention TXT rejects negative correction values instead of silently changing them to zero", () => {
  assert.throws(() => buildVatRetentionTxt({ agentRif: row.agentRif, periodYyyymm: row.periodYyyymm, rows: [{ ...row, vatWithheld: -12 }] }), TaxReportingFailure);
});

test("retention TXT rejects malformed dates, RIFs, and certificate identities", () => {
  for (const candidate of [
    { ...row, date: "2026-02-30" },
    { ...row, supplierRif: "" },
    { ...row, voucherNumber: "missing" },
  ]) {
    assert.throws(() => buildVatRetentionTxt({ agentRif: row.agentRif, periodYyyymm: row.periodYyyymm, rows: [candidate] }), TaxReportingFailure);
  }
  assert.throws(() => buildVatRetentionTxt({ agentRif: row.agentRif, periodYyyymm: "202613", rows: [] }), TaxReportingFailure);
});

test("retention TXT Latin-1 encoder preserves accents and replaces unsupported characters", () => {
  assert.deepEqual([...new Uint8Array(encodeVatRetentionTxtLatin1("ñ €"))], [0xf1, 0x20, 0x3f]);
});
