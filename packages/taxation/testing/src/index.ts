import { companyId } from "@kontave/companies-domain";
import { exactDecimal } from "@kontave/monetary-domain";
import { productId } from "@kontave/products-domain";
import {
  ProductTaxProfile,
  productTaxProfileId,
  taxRule,
  taxRuleId,
  taxationDate,
  type TaxTreatment,
} from "@kontave/taxation-domain";
import { VENEZUELAN_IVA } from "@kontave/taxation-venezuela";

export function venezuelanProductTaxProfileFixture(treatment: TaxTreatment = "taxed"): ProductTaxProfile {
  return new ProductTaxProfile({
    id: productTaxProfileId(`tax-profile-${treatment}`), companyId: companyId("tax-company-1"), productId: productId(`tax-product-${treatment}`),
    jurisdiction: "VE", version: 1,
    assignments: [{
      taxCode: VENEZUELAN_IVA, treatment, effectiveFrom: taxationDate("2026-01-01"), effectiveTo: null,
      legalBasis: `Fixture classification for ${treatment}`, classificationVersion: `fixture-class-${treatment}-v1`,
    }],
  });
}

export function venezuelanVatRuleFixture(treatment: TaxTreatment = "taxed", rate = treatment === "taxed" ? "16" : "0") {
  return taxRule({
    id: taxRuleId(`fixture-iva-${treatment}`), taxCode: VENEZUELAN_IVA, jurisdiction: "VE", treatment, rate: exactDecimal(rate),
    calculationMode: "tax_exclusive", effectiveFrom: taxationDate("2026-01-01"), effectiveTo: null,
    legalBasis: `Fixture rule for ${treatment}`, version: `fixture-iva-${treatment}-v1`,
  });
}
