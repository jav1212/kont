import assert from "node:assert/strict";
import test from "node:test";
import { moneyFromDecimal } from "@kontave/monetary/domain";
import { companyId } from "@kontave/companies/domain";
import { taxationDate } from "@kontave/taxation/domain";
import { reviewLegacyVatSource } from "../../src/application/legacy-source-review";
import { taxReportingFactFixture } from "../../src/testing";

test("legacy credit-note headers remain negative while positive lines are normalized only for reconciliation", () => {
  const seed = taxReportingFactFixture({ deductible: { state: "ineligible", amount: moneyFromDecimal("0", taxReportingFactFixture().currency), reason: null } });
  const money = (value: string) => moneyFromDecimal(value, seed.currency);
  const fact = reviewLegacyVatSource({ id: "credit-1", kind: "purchase_credit_note", affectedSourceId: "original-invoice-id", lineCount: 1, headerTax: money("-16"), headerTaxableBase: money("-100"), headerExemptBase: money("0"), headerTotal: money("-116"), lineTax: money("16"), lineTaxableBase: money("100"), lineTotal: money("116"), historicalExemptBase: money("0"), historicalRateBreakdowns: [{ rate: "16", category: "taxable", taxableBase: money("100"), taxAmount: money("16"), ruleVersion: "legacy-source" }], documentDate: "2026-09-02" }, { ...seed, id: "credit-fact", affectedFactId: "original-fact", counterpartyFiscalProfile: { companyId: companyId(seed.scope.companyId), counterpartyId: "supplier-1", contributorStatus: "ordinary", residenceStatus: "domestic", effectiveFrom: taxationDate("2026-01-01"), effectiveTo: null, legalBasis: "Reviewed", evidenceReference: "registry:1", version: 1 } });
  assert.equal(fact.signed.taxAmount.minorAmount, -1600n); assert.equal(fact.reconciliation.state, "reconciled");
});

test("legacy source with zero line-tax snapshots stays out of reconciled books", () => {
  const seed = taxReportingFactFixture();
  const money = (value: string) => moneyFromDecimal(value, seed.currency);
  const fact = reviewLegacyVatSource({
    id: "purchase-zero-line-tax",
    kind: "purchase_invoice",
    affectedSourceId: null,
    lineCount: 1,
    headerTax: money("16"),
    headerTaxableBase: money("100"),
    headerExemptBase: money("0"),
    headerTotal: money("116"),
    lineTax: money("0"),
    lineTaxableBase: money("100"),
    lineTotal: money("116"),
    historicalExemptBase: money("0"),
    historicalRateBreakdowns: [{ rate: "16", category: "taxable", taxableBase: money("100"), taxAmount: money("16"), ruleVersion: "reviewed-source" }],
    documentDate: "2026-09-02",
  }, { ...seed, id: "fact-zero-line-tax" });
  assert.equal(fact.reconciliation.state, "issue");
  assert.equal(fact.reconciliation.reason, "LEGACY_HEADER_LINE_MISMATCH");
  assert.equal(fact.reconciliation.expectedTaxAmount?.minorAmount, 0n);
});

test("legacy purchases cannot be reconciled or credited without reviewed counterparty classification", () => {
  const seed = taxReportingFactFixture();
  const money = (value: string) => moneyFromDecimal(value, seed.currency);
  const fact = reviewLegacyVatSource({ id: "purchase-reviewed-lines", kind: "purchase_invoice", affectedSourceId: null, lineCount: 1, headerTax: money("16"), headerTaxableBase: money("100"), headerExemptBase: money("0"), headerTotal: money("116"), lineTax: money("16"), lineTaxableBase: money("100"), lineTotal: money("116"), historicalExemptBase: money("0"), historicalRateBreakdowns: [{ rate: "16", category: "taxable", taxableBase: money("100"), taxAmount: money("16"), ruleVersion: "reviewed-source" }], documentDate: "2026-09-02" }, { ...seed, id: "purchase-missing-profile" });
  assert.equal(fact.reconciliation.state, "issue");
  assert.equal(fact.reconciliation.reason, "COUNTERPARTY_FISCAL_PROFILE_REVIEW_REQUIRED");
  assert.equal(fact.deductible.state, "pending_review");
});

test("legacy purchases with an unverified counterparty profile remain review issues", () => {
  const seed = taxReportingFactFixture();
  const money = (value: string) => moneyFromDecimal(value, seed.currency);
  const fact = reviewLegacyVatSource({
    id: "purchase-unverified-profile", kind: "purchase_invoice", affectedSourceId: null, lineCount: 1,
    headerTax: money("16"), headerTaxableBase: money("100"), headerExemptBase: money("0"), headerTotal: money("116"),
    lineTax: money("16"), lineTaxableBase: money("100"), lineTotal: money("116"), historicalExemptBase: money("0"),
    historicalRateBreakdowns: [{ rate: "16", category: "taxable", taxableBase: money("100"), taxAmount: money("16"), ruleVersion: "reviewed-source" }],
    documentDate: "2026-09-02",
  }, {
    ...seed, id: "purchase-unverified-profile-fact", counterpartyFiscalProfile: {
      companyId: companyId(seed.scope.companyId), counterpartyId: "supplier-1", contributorStatus: "unverified",
      residenceStatus: "domestic", effectiveFrom: taxationDate("2026-01-01"), effectiveTo: null,
      legalBasis: "Unverified", evidenceReference: "pending", version: 1,
    },
  });
  assert.equal(fact.reconciliation.state, "issue");
  assert.equal(fact.reconciliation.reason, "COUNTERPARTY_FISCAL_PROFILE_UNVERIFIED");
  assert.equal(fact.deductible.state, "pending_review");
});
