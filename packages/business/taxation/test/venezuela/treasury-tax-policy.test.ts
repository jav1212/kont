import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { currency, exactDecimal, moneyFromDecimal } from "@kontave/monetary/domain";
import { organizationId } from "@kontave/organizations/domain";
import { TaxationFailure, taxationDate } from "../../src/domain";
import { calculateVenezuelanTreasuryTax, venezuelanArticle24ForeignCurrencyPolicyFixture, venezuelanDecree4972PolicyFixture, type VenezuelanTreasuryTaxOperation } from "../../src/venezuela/treasury-tax-policy";

const VES = currency("VES", 2);
const scope = { organizationId: organizationId("org-a"), companyId: companyId("company-a") };
const operation: VenezuelanTreasuryTaxOperation = { bankDebit: { id: "debit-1", scope, operationDate: taxationDate("2026-09-30"), debitAmount: moneyFromDecimal("100", VES) }, subject: "article_4_1_special_passive_subject", paymentKind: "bank_account_debit", paymentCurrencyKind: "legal_tender", financialChannel: "national_without_foreign_correspondent" };
const policy = () => venezuelanDecree4972PolicyFixture({ id: "ve-4972", scope, version: "4972-v1", effectiveTo: null, ratePercent: exactDecimal("0"), base: { kind: "full_debit_amount", currency: VES }, roundingMode: "half_up", legalBasis: "Configured after legal review", approval: { approvalReference: "approval", approvedBy: "tax-admin", approvedAt: "2026-01-01T00:00:00.000Z", evidenceReference: "approval-file" } });

test("uses the source-backed 2024 fixture only for explicitly classified article 4(1-4) operations", () => {
  const result = calculateVenezuelanTreasuryTax({ policies: [policy()], operation, exclusion: null });
  assert.equal(result.calculation.taxAmount.minorAmount, 0n);
  assert.equal(result.legalEvidence.publishedOn, "2024-07-12");
  assert.equal(result.calculation.snapshot.policyEffectiveFrom, "2024-07-15");
});

test("does not infer special-passive-subject status from a bank debit", () => {
  assert.throws(() => calculateVenezuelanTreasuryTax({ policies: [policy()], operation: { ...operation, subject: "not_classified" }, exclusion: null }), failure("TAXATION_CLASSIFICATION_MISSING"));
});

test("does not apply the article 4(1-4) fixture to foreign-currency subject classification", () => {
  assert.throws(() => calculateVenezuelanTreasuryTax({ policies: [policy()], operation: { ...operation, subject: "article_4_5_foreign_currency_or_non_sovereign_crypto", paymentCurrencyKind: "foreign_currency" }, exclusion: null }), failure("TAXATION_RULE_MISSING"));
});

function failure(code: TaxationFailure["code"]): (error: unknown) => boolean { return (error): error is TaxationFailure => error instanceof TaxationFailure && error.code === code; }

test("selects only the matching company and effective revision before detecting ambiguity", () => {
  const current = policy();
  const expired = { ...current, bankDebitTaxPolicy: { ...current.bankDebitTaxPolicy, version: "old", effectiveTo: taxationDate("2025-12-31") } };
  const foreign = { ...current, bankDebitTaxPolicy: { ...current.bankDebitTaxPolicy, scope: { ...scope, companyId: companyId("other") } } };
  const result = calculateVenezuelanTreasuryTax({ policies: [expired, foreign, current], operation, exclusion: null });
  assert.equal(result.calculation.snapshot.policyVersion, "4972-v1");
});

test("rejects unsupported rate attributed to the zero-rate decree and incomplete classification", () => {
  assert.throws(() => venezuelanDecree4972PolicyFixture({ ...policy().bankDebitTaxPolicy, ratePercent: exactDecimal("3") }), failure("TAXATION_RULE_INVALID"));
  for (const patch of [{ paymentCurrencyKind: "unknown" as const }, { financialChannel: "unknown" as const }]) {
    assert.throws(() => calculateVenezuelanTreasuryTax({ policies: [policy()], operation: { ...operation, ...patch }, exclusion: null }), failure("TAXATION_CLASSIFICATION_MISSING"));
  }
});

test("article 24 reference distinguishes foreign-currency banking from payments outside banking", () => {
  const subject = "article_4_5_foreign_currency_or_non_sovereign_crypto" as const;
  const foreignPolicy = venezuelanArticle24ForeignCurrencyPolicyFixture({ ...policy().bankDebitTaxPolicy, ratePercent: exactDecimal("3") }, subject);
  const payment: VenezuelanTreasuryTaxOperation = { ...operation, subject, paymentCurrencyKind: "foreign_currency" };
  const result = calculateVenezuelanTreasuryTax({ policies: [foreignPolicy], operation: payment, exclusion: null });
  assert.equal(result.calculation.taxAmount.minorAmount, 300n);
  assert.throws(() => calculateVenezuelanTreasuryTax({ policies: [foreignPolicy], operation: { ...payment, financialChannel: "national_with_foreign_correspondent" }, exclusion: null }), failure("TAXATION_DECISION_INVALID"));
  const nonbankSubject = "article_4_6_foreign_currency_payment_to_special_passive_subject" as const;
  const nonbank = venezuelanArticle24ForeignCurrencyPolicyFixture({ ...foreignPolicy.bankDebitTaxPolicy }, nonbankSubject);
  const cashPayment: VenezuelanTreasuryTaxOperation = { ...payment, subject: nonbankSubject, paymentKind: "nonbank_debt_extinguishment", financialChannel: "not_applicable" };
  assert.equal(calculateVenezuelanTreasuryTax({ policies: [nonbank], operation: cashPayment, exclusion: null }).calculation.taxAmount.minorAmount, 300n);
});
