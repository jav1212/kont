import assert from "node:assert/strict";
import test from "node:test";
import { currency, exactDecimal, moneyFromDecimal } from "@kontave/monetary/domain";
import { taxCode, taxDecision } from "../../src/domain";
import { toFiscalTaxDetermination } from "../../src/fiscal";

const VES = currency("VES", 2);

test("tax decisions become immutable fiscal snapshots with the correct source", () => {
  const decision = taxDecision({
    taxCode: taxCode("IVA"), treatment: "exonerated", calculationMode: "tax_exclusive", rate: exactDecimal("0"),
    taxableBase: moneyFromDecimal("100", VES), amount: moneyFromDecimal("0", VES), jurisdiction: "VE",
    ruleVersion: "class-v1|rule-v1", legalBasis: "Example", source: { kind: "line", reference: "line-1" },
  });
  const fiscal = toFiscalTaxDetermination(decision);
  assert.equal(fiscal.category, "exonerated");
  assert.deepEqual(fiscal.source, { kind: "line", lineId: "line-1" });
});

test("legal rule category and Profit rate slot map into separate fiscal snapshot fields", () => {
  const decision = taxDecision({
    taxCode: taxCode("IVA"), treatment: "taxed", calculationMode: "tax_exclusive", rate: exactDecimal("16"),
    taxableBase: moneyFromDecimal("100", VES), amount: moneyFromDecimal("16", VES), jurisdiction: "VE",
    ruleVersion: "rule-v2", legalBasis: "Rule evidence", category: "general", legacyRateSlot: "a4",
    source: { kind: "line", reference: "line-2" },
  });
  const fiscal = toFiscalTaxDetermination(decision);
  assert.equal(fiscal.taxCategory, "general");
  assert.equal(fiscal.legacyRateSlot, "a4");
  assert.equal(fiscal.rateCategory, undefined);
});

test("the reduced statutory category is preserved in the historical fiscal snapshot", () => {
  const fiscal = toFiscalTaxDetermination(taxDecision({
    taxCode: taxCode("IVA"), treatment: "taxed", calculationMode: "tax_exclusive", rate: exactDecimal("8"),
    taxableBase: moneyFromDecimal("100", VES), amount: moneyFromDecimal("8", VES), jurisdiction: "VE",
    ruleVersion: "reduced-rule-v1", legalBasis: "Venezuela VAT Law 2020, article 64", category: "reduced",
    source: { kind: "line", reference: "line-reduced" },
  }));
  assert.equal(fiscal.taxCategory, "reduced");
  assert.equal(fiscal.rate, "8");
});

test("legal component identity survives from tax decision to fiscal snapshot", () => {
  const fiscal = toFiscalTaxDetermination(taxDecision({
    taxCode: taxCode("IVA"), treatment: "taxed", calculationMode: "tax_exclusive", rate: exactDecimal("3"),
    taxableBase: moneyFromDecimal("100", VES), amount: moneyFromDecimal("3", VES), jurisdiction: "VE",
    ruleVersion: "payment-v1", legalBasis: "Configured rule", category: "payment_surcharge", component: "payment",
    source: { kind: "payment", reference: "payment-1" },
  }));
  assert.equal(fiscal.taxCategory, "payment_surcharge");
  assert.equal(fiscal.component, "payment");
});
