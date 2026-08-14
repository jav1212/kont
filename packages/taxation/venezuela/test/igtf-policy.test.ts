import assert from "node:assert/strict";
import test from "node:test";
import { currency, exactDecimal, moneyFromDecimal } from "@kontave/monetary-domain";
import { TaxationFailure, taxRule, taxRuleId, taxationDate } from "@kontave/taxation-domain";
import { VENEZUELAN_IGTF, resolveVenezuelanIgtf, type VenezuelanPaymentTaxRule } from "../src/index.js";

const VES = currency("VES", 2);
const USD = currency("USD", 2);
const EUR = currency("EUR", 2);

function rule(version = "igtf-v1"): VenezuelanPaymentTaxRule {
  return {
    taxRule: taxRule({
      id: taxRuleId(version), taxCode: VENEZUELAN_IGTF, jurisdiction: "VE", treatment: "taxed", rate: exactDecimal("3"), calculationMode: "tax_exclusive",
      effectiveFrom: taxationDate("2026-01-01"), effectiveTo: null, legalBasis: "Example payment tax rule", version,
    }),
    currencyCondition: { kind: "different_from_legal_tender" },
  };
}

test("eligible foreign-currency payment creates IGTF over its recognized amount", () => {
  const decision = resolveVenezuelanIgtf({ rules: [rule()], operationDate: "2026-08-13", paymentKey: "usd-partial", tenderedCurrency: USD, legalTenderCurrency: VES, recognizedAmount: moneyFromDecimal("100", VES), operationQualifies: true, roundingMode: "half_up" });
  assert.equal(decision?.source.kind, "payment");
  assert.equal(decision?.taxableBase.minorAmount, 10_000n);
  assert.equal(decision?.amount.minorAmount, 300n);
});

test("legal-tender and non-qualifying payments do not create IGTF", () => {
  assert.equal(resolveVenezuelanIgtf({ rules: [rule()], operationDate: "2026-08-13", paymentKey: "ves", tenderedCurrency: VES, legalTenderCurrency: VES, recognizedAmount: moneyFromDecimal("100", VES), operationQualifies: true, roundingMode: "half_up" }), null);
  assert.equal(resolveVenezuelanIgtf({ rules: [rule()], operationDate: "2026-08-13", paymentKey: "usd", tenderedCurrency: USD, legalTenderCurrency: VES, recognizedAmount: moneyFromDecimal("100", VES), operationQualifies: false, roundingMode: "half_up" }), null);
});

test("mixed payments are assessed independently", () => {
  const inputs = [
    { key: "ves", currency: VES, amount: "50" },
    { key: "usd", currency: USD, amount: "100" },
    { key: "eur", currency: EUR, amount: "20" },
  ];
  const decisions = inputs.map((payment) => resolveVenezuelanIgtf({ rules: [rule()], operationDate: "2026-08-13", paymentKey: payment.key, tenderedCurrency: payment.currency, legalTenderCurrency: VES, recognizedAmount: moneyFromDecimal(payment.amount, VES), operationQualifies: true, roundingMode: "half_up" })).filter((decision) => decision !== null);
  assert.equal(decisions.length, 2);
  assert.equal(decisions.reduce((total, decision) => total + decision.amount.minorAmount, 0n), 360n);
});

test("overlapping IGTF rules are rejected", () => {
  assert.throws(() => resolveVenezuelanIgtf({ rules: [rule("v1"), rule("v2")], operationDate: "2026-08-13", paymentKey: "usd", tenderedCurrency: USD, legalTenderCurrency: VES, recognizedAmount: moneyFromDecimal("100", VES), operationQualifies: true, roundingMode: "half_up" }),
    (error: unknown) => error instanceof TaxationFailure && error.code === "TAXATION_RULE_AMBIGUOUS");
});

test("IGTF cannot be configured as tax included in a payment", () => {
  const invalid = rule();
  assert.throws(() => resolveVenezuelanIgtf({
    rules: [{ ...invalid, taxRule: { ...invalid.taxRule, calculationMode: "tax_inclusive" } }],
    operationDate: "2026-08-13", paymentKey: "usd", tenderedCurrency: USD, legalTenderCurrency: VES,
    recognizedAmount: moneyFromDecimal("100", VES), operationQualifies: true, roundingMode: "half_up",
  }), (error: unknown) => error instanceof TaxationFailure && error.code === "TAXATION_RULE_INVALID");
});
