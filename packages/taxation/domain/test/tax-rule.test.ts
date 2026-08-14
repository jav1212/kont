import assert from "node:assert/strict";
import test from "node:test";
import { exactDecimal } from "@kontave/monetary-domain";
import { TaxationFailure, resolveTaxRule, taxCode, taxRule, taxRuleId, taxationDate } from "../src/index.js";

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
