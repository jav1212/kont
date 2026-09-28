import assert from "node:assert/strict";
import test from "node:test";
import { encodeFiscalDocument } from "@kontave/fiscal/supabase";
import { fiscalInvoiceFixture } from "@kontave/fiscal/testing";
import { formatFiscalMoney } from "./format-fiscal-money";
import type { FiscalDocumentDto } from "./fiscal-document-types";

test("formats minor units exactly beyond Number precision", () => {
  assert.equal(formatFiscalMoney({ minorAmount: "9007199254740993123", currency: { code: "VES", minorUnit: 2 } }), "VES 90.071.992.547.409.931,23");
  assert.equal(formatFiscalMoney({ minorAmount: "-5", currency: { code: "VES", minorUnit: 2 } }), "-VES 0,05");
  assert.equal(formatFiscalMoney({ minorAmount: "1e3", currency: { code: "VES", minorUnit: 2 } }), "Importe inválido");
});

test("honors the currency exponent without assuming two decimals", () => {
  assert.equal(formatFiscalMoney({ minorAmount: "12003", currency: { code: "JPY", minorUnit: 0 } }), "JPY 12.003");
  assert.equal(formatFiscalMoney({ minorAmount: "12003", currency: { code: "KWD", minorUnit: 3 } }), "KWD 12,003");
  assert.equal(formatFiscalMoney({ minorAmount: "0", currency: { code: "VES", minorUnit: 2 } }), "VES 0,00");
});

test("reads the actual fiscal persistence codec used by the detail API", () => {
  const document = JSON.parse(encodeFiscalDocument(fiscalInvoiceFixture())) as FiscalDocumentDto;
  assert.equal(formatFiscalMoney(document.totals.payableAmount), "VES 100,00");
  assert.equal(formatFiscalMoney(document.lines[0].unitPrice), "VES 100,00");
  assert.equal(formatFiscalMoney(document.taxDeterminations[0].taxableBase), "VES 100,00");
  assert.equal(formatFiscalMoney(document.taxDeterminations[0].amount), "VES 0,00");
  assert.equal(document.taxDeterminations[0].rate, "0");
});
