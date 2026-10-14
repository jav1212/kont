import assert from "node:assert/strict";
import test from "node:test";
import { fiscalDate, fiscalDocumentId, fiscalInstant, fiscalNumber, type FiscalDocument } from "@kontave/fiscal/domain";
import { fiscalInvoiceFixture } from "@kontave/fiscal/testing";
import { exactDecimal, moneyFromDecimal } from "@kontave/monetary/domain";
import { companyId } from "@kontave/companies/domain";
import { taxationDate } from "@kontave/taxation/domain";
import { fiscalDocumentTaxFact } from "../../src/application/fiscal-document-fact";
import { TaxReportingFailure } from "../../src/domain";

function invoice(overrides: { readonly category?: "taxable" | "other"; readonly direction?: "issued" | "received"; readonly type?: "invoice" | "credit_note" } = {}): FiscalDocument {
  const base = fiscalInvoiceFixture();
  const lineId = base.lines[0]!.id;
  const tax = moneyFromDecimal(overrides.category === "other" ? "0" : "16", base.documentCurrency);
  const taxableBase = moneyFromDecimal("100", base.documentCurrency);
  const note = overrides.type === "credit_note";
  const direction = overrides.direction ?? "issued";
  const category = overrides.category ?? "taxable";
  const determination = { taxCode: "IVA", category, calculationMode: "tax_exclusive" as const, rate: exactDecimal(category === "other" ? "0" : "16"), taxableBase, amount: tax, jurisdiction: "VE", ruleVersion: "rule-v1", source: { kind: "line" as const, lineId }, component: "base" as const };
  const affectedDocument = note ? { type: "invoice" as const, fiscalNumber: fiscalNumber("ORIGINAL-1"), issueDate: fiscalDate("2026-09-01"), issuerTaxIdentifier: base.issuer.taxIdentifier, issuerRegistration: null, internalDocumentId: fiscalDocumentId("original-fiscal-document") } : null;
  return fiscalInvoiceFixture({
    ...base,
    id: fiscalDocumentId(note ? "credit-document-1" : "fiscal-document-1"),
    type: note ? "credit_note" : "invoice",
    direction,
    affectedDocument,
    taxDeterminations: [determination],
    totals: { ...base.totals, taxSummaries: [{ taxCode: "IVA", category, calculationMode: "tax_exclusive", rate: determination.rate, taxableBase, amount: tax }], taxTotal: tax, payableAmount: moneyFromDecimal(category === "other" ? "100" : "116", base.documentCurrency), outstandingAmount: moneyFromDecimal(category === "other" ? "100" : "116", base.documentCurrency) },
    status: direction === "issued" ? "issued" : "received",
    number: fiscalNumber(note ? "CREDIT-1" : "INVOICE-1"),
    issuedAt: fiscalInstant("2026-09-10T12:00:00.000Z"),
    issueDate: fiscalDate("2026-09-10"),
  });
}

const scope = { tenantId: "tenant-1", organizationId: "organization-1", companyId: "fiscal-company-1" };

test("maps a finalized invoice from its stored IVA snapshots without consulting current rules", () => {
  const fact = fiscalDocumentTaxFact(invoice(), scope, { factId: "fact-1", lineageKey: "sale:fiscal-document-1", recognitionDate: "2026-09-10", counterpartyCountryCode: "VE", affectedFactId: null, withholding: null, recordedAt: "2026-09-10T12:00:00.000Z" });
  assert.equal(fact.direction, "sale");
  assert.equal(fact.signed.taxableBase.minorAmount, 10000n);
  assert.equal(fact.signed.taxAmount.minorAmount, 1600n);
  assert.equal(fact.signed.total.minorAmount, 11600n);
  assert.equal(fact.rateBreakdowns[0]?.ruleVersion, "rule-v1");
  assert.equal(fact.reconciliation.state, "reconciled");
});

test("credit notes reverse the stored amounts once and require an explicit affected fact", () => {
  const note = fiscalDocumentTaxFact(invoice({ type: "credit_note" }), scope, { factId: "fact-credit", lineageKey: "sale:credit-document-1", recognitionDate: "2026-09-15", counterpartyCountryCode: "VE", affectedFactId: "fact-original", withholding: null, recordedAt: "2026-09-15T12:00:00.000Z" });
  assert.equal(note.documentKind, "credit_note");
  assert.equal(note.signed.taxAmount.minorAmount, -1600n);
  assert.equal(note.signed.total.minorAmount, -11600n);
  assert.equal(note.affectedSourceId, "original-fiscal-document");
  assert.throws(() => fiscalDocumentTaxFact(invoice({ type: "credit_note" }), scope, { factId: "fact-credit", lineageKey: "credit", recognitionDate: "2026-09-15", counterpartyCountryCode: "VE", affectedFactId: null, withholding: null, recordedAt: "2026-09-15T12:00:00.000Z" }), TaxReportingFailure);
});

test("received purchases require explicit deductible-credit evidence and unknown classifications stay in review", () => {
  const pending = fiscalDocumentTaxFact(invoice({ direction: "received" }), scope, { factId: "fact-purchase", lineageKey: "purchase:fiscal-document-1", recognitionDate: "2026-09-10", counterpartyCountryCode: "VE", affectedFactId: null, withholding: null, recordedAt: "2026-09-10T12:00:00.000Z" });
  assert.equal(pending.direction, "purchase");
  assert.equal(pending.deductible.state, "pending_review");
  const unknownDocument = invoice({ category: "other", direction: "received" });
  const unknown = fiscalDocumentTaxFact(unknownDocument, scope, { factId: "fact-unknown", lineageKey: "unknown", recognitionDate: "2026-09-10", counterpartyCountryCode: null, deductible: { state: "eligible", amount: moneyFromDecimal("0", unknownDocument.documentCurrency), reason: null }, affectedFactId: null, withholding: null, recordedAt: "2026-09-10T12:00:00.000Z" });
  assert.equal(unknown.reconciliation.state, "issue");
  assert.equal(unknown.deductible.state, "pending_review");
});

test("received purchases retain the reviewed counterparty profile effective on the invoice date", () => {
  const profile = { companyId: companyId(scope.companyId), counterpartyId: "supplier-1", contributorStatus: "ordinary" as const, residenceStatus: "domestic" as const, effectiveFrom: taxationDate("2026-01-01"), effectiveTo: null, legalBasis: "Reviewed supplier registry", evidenceReference: "registry:2026:1", version: 1 };
  const document = invoice({ direction: "received" });
  const fact = fiscalDocumentTaxFact(document, scope, { factId: "fact-profile", lineageKey: "purchase:profile", recognitionDate: "2026-09-10", counterpartyCountryCode: "VE", counterpartyFiscalProfile: profile, deductible: { state: "eligible", amount: moneyFromDecimal("16", document.documentCurrency), reason: null }, affectedFactId: null, withholding: null, recordedAt: "2026-09-10T12:00:00.000Z" });
  assert.equal(fact.counterpartyFiscalProfile?.evidenceReference, "registry:2026:1");
  assert.equal(fact.deductible.state, "eligible");
  assert.throws(() => fiscalDocumentTaxFact(document, scope, { factId: "fact-profile-wrong-date", lineageKey: "purchase:profile-wrong-date", recognitionDate: "2026-09-10", counterpartyCountryCode: "VE", counterpartyFiscalProfile: { ...profile, effectiveFrom: taxationDate("2026-10-01") }, affectedFactId: null, withholding: null, recordedAt: "2026-09-10T12:00:00.000Z" }), TaxReportingFailure);
});

test("draft documents cannot be promoted to historical VAT facts", () => {
  assert.throws(() => fiscalDocumentTaxFact(fiscalInvoiceFixture(), scope, { factId: "draft-fact", lineageKey: "draft", recognitionDate: "2026-09-10", counterpartyCountryCode: "VE", affectedFactId: null, withholding: null, recordedAt: "2026-09-10T12:00:00.000Z" }), TaxReportingFailure);
});
