import assert from "node:assert/strict";
import test from "node:test";
import { exactDecimal } from "@kontave/monetary/domain";
import { TaxationFailure, resolveTaxRule, taxCode, taxRule, taxRuleId, taxationDate } from "../../src/domain";

const IVA = taxCode("IVA");

function rule(from: string, to: string | null, version: string) {
  return taxRule({
    id: taxRuleId(`rule-${version}`), taxCode: IVA, jurisdiction: "VE", treatment: "taxed", rate: exactDecimal("16"),
    calculationMode: "tax_exclusive", effectiveFrom: taxationDate(from), effectiveTo: to === null ? null : taxationDate(to), legalBasis: "Example only", version,
  });
}

test("rule resolution is date-aware", () => {
  const resolved = resolveTaxRule({ rules: [rule("2026-01-01", null, "v1")], taxCode: IVA, treatment: "taxed", jurisdiction: "VE", date: "2026-08-13" });
  assert.equal(resolved.version, "v1");
});

test("ambiguous effective rules are rejected instead of choosing silently", () => {
  assert.throws(() => resolveTaxRule({ rules: [rule("2026-01-01", null, "v1"), rule("2026-06-01", null, "v2")], taxCode: IVA, treatment: "taxed", jurisdiction: "VE", date: "2026-08-13" }),
    (error: unknown) => error instanceof TaxationFailure && error.code === "TAXATION_RULE_AMBIGUOUS");
});

test("legal category selector rejects ambiguity without treating legacy slots as aliquots", () => {
  const general = taxRule({ ...rule("2026-01-01", null, "general"), category: "general" });
  const other = taxRule({ ...rule("2026-01-01", null, "other"), id: taxRuleId("rule-other"), category: "other" });
  assert.throws(() => resolveTaxRule({ rules: [general, other], taxCode: IVA, treatment: "taxed", jurisdiction: "VE", date: "2026-08-13" }),
    (error: unknown) => error instanceof TaxationFailure && error.code === "TAXATION_RULE_AMBIGUOUS");
  assert.equal(resolveTaxRule({ rules: [general, other], taxCode: IVA, treatment: "taxed", jurisdiction: "VE", date: "2026-08-13", category: "other" }).id, other.id);
});

test("zero-rated treatment preserves its zero rate without becoming an exemption", () => {
  const zero = taxRule({ ...rule("2026-01-01", null, "zero"), treatment: "zero_rated", rate: exactDecimal("0"), category: "general" });
  assert.equal(resolveTaxRule({ rules: [zero], taxCode: IVA, treatment: "zero_rated", jurisdiction: "VE", date: "2026-08-13", category: "general" }).treatment, "zero_rated");
});

test("legal category and legacy slot select one configured rule without inventing an aliquot", () => {
  const first = taxRule({ ...rule("2026-01-01", null, "slot-a1"), id: taxRuleId("rule-slot-a1"), category: "general", legacyRateSlot: "a1" });
  const second = taxRule({ ...rule("2026-01-01", null, "slot-a2"), id: taxRuleId("rule-slot-a2"), category: "general", legacyRateSlot: "a2" });
  assert.throws(() => resolveTaxRule({ rules: [first, second], taxCode: IVA, treatment: "taxed", jurisdiction: "VE", date: "2026-08-13", category: "general" }),
    (error: unknown) => error instanceof TaxationFailure && error.code === "TAXATION_RULE_AMBIGUOUS");
  assert.equal(resolveTaxRule({ rules: [first, second], taxCode: IVA, treatment: "taxed", jurisdiction: "VE", date: "2026-08-13", category: "general", legacyRateSlot: "a2" }).id, second.id);
});

test("the statutory reduced-rate category remains distinct from the general category", () => {
  const general = taxRule({ ...rule("2026-01-01", null, "general"), category: "general" });
  const reduced = taxRule({ ...rule("2026-01-01", null, "reduced"), id: taxRuleId("rule-reduced"), rate: exactDecimal("8"), category: "reduced" });
  assert.equal(resolveTaxRule({ rules: [general, reduced], taxCode: IVA, treatment: "taxed", jurisdiction: "VE", date: "2026-08-13", category: "reduced" }).id, reduced.id);
});

test("tax rule categories cannot contradict the configured legal component", () => {
  const base = rule("2026-01-01", null, "component-check");
  assert.throws(() => taxRule({ ...base, category: "luxury_surcharge", component: "base" }), { code: "TAXATION_RULE_INVALID" });
  assert.throws(() => taxRule({ ...base, category: "payment_surcharge", component: "payment", treatment: "exempt", rate: exactDecimal("0") }), { code: "TAXATION_RULE_INVALID" });
  assert.equal(taxRule({ ...base, category: "luxury_surcharge", component: "luxury" }).component, "luxury");
});
