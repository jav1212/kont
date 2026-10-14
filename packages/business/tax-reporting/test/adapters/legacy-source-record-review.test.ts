import assert from "node:assert/strict";
import test from "node:test";
import { currency, moneyFromDecimal } from "@kontave/monetary/domain";
import { companyId } from "@kontave/companies/domain";
import { taxationDate } from "@kontave/taxation/domain";
import { reviewLegacyVatSourceRecord } from "../../src/application/legacy-source-record-review";
import { TaxReportingFailure } from "../../src/domain";
import { taxReportingFactFixture } from "../../src/testing";
import type { LegacyVatSourceRecord } from "../../src/application/legacy-vat-source";

const VES = currency("VES", 2);
const money = (value: string) => moneyFromDecimal(value, VES);
const seedFact = taxReportingFactFixture();
const seed = (id: string) => ({
  id,
  scope: seedFact.scope,
  recognitionDate: "2026-09-02",
  period: "2026-09",
  counterparty: seedFact.counterparty,
  counterpartyFiscalProfile: { companyId: companyId(seedFact.scope.companyId), counterpartyId: "supplier-1", contributorStatus: "ordinary" as const, residenceStatus: "domestic" as const, effectiveFrom: taxationDate("2026-01-01"), effectiveTo: null, legalBasis: "Reviewed supplier registry", evidenceReference: "registry:2026:1", version: 1 },
  deductible: seedFact.deductible,
  affectedFactId: null,
  withholding: null,
  importEvidence: null,
  recordedAt: "2026-09-03T10:00:00.000Z",
});
const rateEvidence = [{ rate: "16", category: "taxable" as const, taxableBase: money("100"), taxAmount: money("16"), ruleVersion: "reviewed-source" }];

function rawPurchase(taxAmount: string | null): LegacyVatSourceRecord {
  return {
    id: "purchase-1",
    kind: "purchase_invoice",
    affectedId: null,
    documentDate: "2026-09-02",
    updatedAt: "2026-09-03T09:00:00.000Z",
    header: { currency: "VES", subtotal: "100.00", taxAmount: "16.00", total: "116.00", withheldAmount: "0.00", withholdingCertificate: null, counterpartyTaxId: "J-12345678-9", counterpartyName: "Proveedor" },
    lines: [{ rateCode: "rate-historic", base: "100.00", net: "116.00", included: false, taxAmount, taxType: "IVA", taxValue: "16", taxConcept: "IVA" }],
  };
}

test("reviewed historical purchase becomes a fact only when stored lines reconcile", () => {
  const fact = reviewLegacyVatSourceRecord(rawPurchase("16.00"), seed("purchase-fact-1"), {
    currency: VES, exemptBase: money("0"), historicalExemptBase: money("0"), rates: rateEvidence,
  });
  assert.equal(fact.direction, "purchase");
  assert.equal(fact.documentKind, "invoice");
  assert.equal(fact.counterparty.taxIdentifier, "J-12345678-9");
  assert.equal(fact.counterparty.name, "Proveedor");
  assert.equal(fact.reconciliation.state, "reconciled");
  assert.equal(fact.signed.taxAmount.minorAmount, 1600n);
});

test("legacy correction preserves the source invoice identity from the authorized bridge", () => {
  const source: LegacyVatSourceRecord = {
    ...rawPurchase("16.00"),
    kind: "purchase_credit_note",
    affectedId: "original-purchase-id",
    header: { ...rawPurchase("16.00").header, subtotal: "-100.00", taxAmount: "-16.00", total: "-116.00" },
  };
  const fact = reviewLegacyVatSourceRecord(source, { ...seed("credit-fact"), affectedFactId: "original-fact" }, {
    currency: VES, exemptBase: money("0"), historicalExemptBase: money("0"),
    rates: [{ rate: "16", category: "taxable", taxableBase: money("100"), taxAmount: money("16"), ruleVersion: "reviewed-source" }],
  });
  assert.equal(fact.affectedFactId, "original-fact");
  assert.equal(fact.affectedSourceId, "original-purchase-id");
  assert.throws(() => reviewLegacyVatSourceRecord({ ...source, affectedId: null }, { ...seed("unlinked-credit-fact"), affectedFactId: "original-fact" }, {
    currency: VES, exemptBase: money("0"), historicalExemptBase: money("0"),
    rates: [{ rate: "16", category: "taxable", taxableBase: money("100"), taxAmount: money("16"), ruleVersion: "reviewed-source" }],
  }), TaxReportingFailure);
});

test("legacy debit notes retain a positive sign and the affected invoice identity", () => {
  const source: LegacyVatSourceRecord = {
    ...rawPurchase("16.00"),
    kind: "purchase_debit_note",
    affectedId: "original-purchase-id",
  };
  const fact = reviewLegacyVatSourceRecord(source, { ...seed("debit-fact"), affectedFactId: "original-fact" }, {
    currency: VES, exemptBase: money("0"), historicalExemptBase: money("0"), rates: rateEvidence,
  });
  assert.equal(fact.documentKind, "debit_note");
  assert.equal(fact.signed.taxAmount.minorAmount, 1600n);
  assert.equal(fact.affectedSourceId, "original-purchase-id");
});

test("legacy purchase retention is preserved only with its certificate and reviewed occurrence time", () => {
  const source: LegacyVatSourceRecord = {
    ...rawPurchase("16.00"),
    header: { ...rawPurchase("16.00").header, withheldAmount: "12.00", withholdingCertificate: "RET-2026-09-01" },
  };
  assert.throws(() => reviewLegacyVatSourceRecord(source, seed("purchase-withholding-missing-date"), {
    currency: VES, exemptBase: money("0"), historicalExemptBase: money("0"), rates: rateEvidence,
  }), TaxReportingFailure);
  const fact = reviewLegacyVatSourceRecord(source, seed("purchase-withholding"), {
    currency: VES, exemptBase: money("0"), historicalExemptBase: money("0"), rates: rateEvidence,
    withholdingOccurredAt: "2026-09-02T11:30:00.000Z",
  });
  assert.deepEqual(fact.withholding, {
    kind: "practiced", amount: money("12"), certificateReference: "RET-2026-09-01", occurredAt: "2026-09-02T11:30:00.000Z",
  });
});

test("zero stored purchase tax and absent sales line tax are retained as review issues", () => {
  const purchase = reviewLegacyVatSourceRecord(rawPurchase("0.00"), seed("purchase-fact-zero"), {
    currency: VES, exemptBase: money("0"), historicalExemptBase: money("0"), rates: rateEvidence,
  });
  assert.equal(purchase.reconciliation.state, "issue");
  assert.equal(purchase.reconciliation.expectedTaxAmount?.minorAmount, 0n);

  const sales: LegacyVatSourceRecord = {
    ...rawPurchase(null),
    id: "sales-1",
    kind: "sales_invoice",
    lines: [{ rateCode: "rate-historic", base: "100.00", net: "116.00", included: false, taxAmount: null, taxType: null, taxValue: null, taxConcept: null }],
  };
  const sale = reviewLegacyVatSourceRecord(sales, seed("sales-fact-missing-line-tax"), {
    currency: VES, exemptBase: money("0"), historicalExemptBase: money("0"), rates: rateEvidence,
  });
  assert.equal(sale.direction, "sale");
  assert.equal(sale.reconciliation.state, "issue");
  assert.equal(sale.reconciliation.reason, "LEGACY_SOURCE_INCOMPLETE");
});

test("legacy review rejects missing document date rather than substituting recognition date", () => {
  const source = { ...rawPurchase("16.00"), documentDate: null };
  assert.throws(() => reviewLegacyVatSourceRecord(source, seed("purchase-no-date"), {
    currency: VES, exemptBase: money("0"), historicalExemptBase: money("0"), rates: rateEvidence,
  }), TaxReportingFailure);
});
