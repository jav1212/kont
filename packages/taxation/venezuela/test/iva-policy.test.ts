import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies-domain";
import { currency, exactDecimal, moneyFromDecimal } from "@kontave/monetary-domain";
import { productId } from "@kontave/products-domain";
import {
  ProductTaxProfile,
  TaxationFailure,
  productTaxProfileId,
  taxRule,
  taxRuleId,
  taxationDate,
  type TaxTreatment,
} from "@kontave/taxation-domain";
import { VENEZUELAN_IVA, resolveVenezuelanVat } from "../src/index.js";

const VES = currency("VES", 2);

function profile(treatment: TaxTreatment, from = "2026-01-01", to: string | null = null): ProductTaxProfile {
  return new ProductTaxProfile({
    id: productTaxProfileId(`profile-${treatment}`), companyId: companyId("company-1"), productId: productId(`product-${treatment}`), jurisdiction: "VE", version: 1,
    assignments: [{ taxCode: VENEZUELAN_IVA, treatment, effectiveFrom: taxationDate(from), effectiveTo: to === null ? null : taxationDate(to), legalBasis: `Classification ${treatment}`, classificationVersion: `class-${treatment}` }],
  });
}

function rule(treatment: TaxTreatment, rate: string, mode: "tax_exclusive" | "tax_inclusive" = "tax_exclusive") {
  return taxRule({
    id: taxRuleId(`iva-${treatment}-${mode}`), taxCode: VENEZUELAN_IVA, jurisdiction: "VE", treatment, rate: exactDecimal(rate), calculationMode: mode,
    effectiveFrom: taxationDate("2026-01-01"), effectiveTo: null, legalBasis: `Example ${treatment} rule`, version: `iva-${treatment}-v1`,
  });
}

test("taxed product resolves exclusive VAT from the line base", () => {
  const decision = resolveVenezuelanVat({ profile: profile("taxed"), rules: [rule("taxed", "16")], operationDate: "2026-08-13", lineReference: "line-1", lineAmount: moneyFromDecimal("100", VES), roundingMode: "half_up" });
  assert.equal(decision.treatment, "taxed");
  assert.equal(decision.taxableBase.minorAmount, 10_000n);
  assert.equal(decision.amount.minorAmount, 1_600n);
});

test("exempt and exonerated products preserve the informative base without tax", () => {
  for (const treatment of ["exempt", "exonerated", "not_subject"] as const) {
    const decision = resolveVenezuelanVat({ profile: profile(treatment), rules: [rule(treatment, "0")], operationDate: "2026-08-13", lineReference: `line-${treatment}`, lineAmount: moneyFromDecimal("100", VES), roundingMode: "half_up" });
    assert.equal(decision.treatment, treatment);
    assert.equal(decision.amount.minorAmount, 0n);
    assert.equal(decision.taxableBase.minorAmount, 10_000n);
  }
});

test("tax included in price separates base and VAT without changing the line total", () => {
  const decision = resolveVenezuelanVat({ profile: profile("taxed"), rules: [rule("taxed", "16", "tax_inclusive")], operationDate: "2026-08-13", lineReference: "line-1", lineAmount: moneyFromDecimal("116", VES), roundingMode: "half_up" });
  assert.equal(decision.taxableBase.minorAmount, 10_000n);
  assert.equal(decision.amount.minorAmount, 1_600n);
});

test("a product classification outside its validity blocks VAT resolution", () => {
  assert.throws(() => resolveVenezuelanVat({ profile: profile("exempt", "2026-01-01", "2026-06-30"), rules: [rule("exempt", "0")], operationDate: "2026-08-13", lineReference: "line-1", lineAmount: moneyFromDecimal("100", VES), roundingMode: "half_up" }),
    (error: unknown) => error instanceof TaxationFailure && error.code === "TAXATION_CLASSIFICATION_MISSING");
});
