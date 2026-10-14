import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { currency, exactDecimal, moneyFromDecimal } from "@kontave/monetary/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { productId } from "@kontave/products/domain";
import {
  ProductTaxProfile,
  ServiceTaxProfile,
  TaxationFailure,
  productTaxProfileId,
  serviceTaxProfileId,
  taxRule,
  taxRuleId,
  taxationDate,
  type TaxRule,
} from "../../src/domain";
import {
  ResolveProductVenezuelanVat,
  type ProductTaxationRepository,
  type ServiceTaxationRepository,
  type TaxationConfigurationRepository,
} from "../../src/application";
import { ResolveServiceVenezuelanVat } from "../../src/application";
import { VENEZUELAN_IVA } from "../../src/venezuela";

const VES = currency("VES", 2);
const product = productId("product-1");
const baseRule = createRule("base", "16", "general", "base");
const luxuryRule = createRule("luxury", "15", "luxury_surcharge", "luxury");
const paymentRule = createRule("payment", "3", "payment_surcharge", "payment");

function createRule(id: string, rate: string, category: "general" | "luxury_surcharge" | "payment_surcharge", component: "base" | "luxury" | "payment"): TaxRule {
  return taxRule({
    id: taxRuleId(`iva-${id}`), taxCode: VENEZUELAN_IVA, jurisdiction: "VE", treatment: "taxed", rate: exactDecimal(rate),
    calculationMode: "tax_exclusive", effectiveFrom: taxationDate("2026-01-01"), effectiveTo: null,
    legalBasis: `Reviewed ${id} rule`, version: `ve-iva-${id}-v1`, category, component,
  });
}

function profile(company = companyId("company-1"), category: "general" | null = "general"): ProductTaxProfile {
  return new ProductTaxProfile({
    id: productTaxProfileId("profile-product-1"), companyId: company, productId: product,
    jurisdiction: "VE", version: 1,
    assignments: [{ taxCode: VENEZUELAN_IVA, treatment: "taxed", category, effectiveFrom: taxationDate("2026-01-01"), effectiveTo: null, legalBasis: "Product tax classification", classificationVersion: "product-tax-v1" }],
  });
}

function repository(foundProfile: ProductTaxProfile | null = profile(), rules: readonly TaxRule[] = [baseRule, luxuryRule, paymentRule]): ProductTaxationRepository {
  return {
    getProfile: async () => foundProfile,
    listRules: async () => rules,
    setTreatment: async () => { throw new Error("Not used by this query"); },
  };
}

function configuration(rules: readonly TaxRule[], version = 1): TaxationConfigurationRepository {
  return {
    getCompanyTaxRuleCatalog: async () => ({ companyId: companyId("company-1"), version, rules }),
    saveCompanyTaxRuleCatalog: async () => { throw new Error("Not used by this query"); },
    getCounterpartyFiscalProfile: async () => null,
    saveCounterpartyFiscalProfile: async () => { throw new Error("Not used by this query"); },
  };
}

function serviceProfile(company = companyId("company-1")): ServiceTaxProfile {
  return new ServiceTaxProfile({
    id: serviceTaxProfileId("profile-service-1"), companyId: company, serviceCode: "CONSULTING", unitCode: "HUR",
    jurisdiction: "VE", version: 1,
    assignments: [{ taxCode: VENEZUELAN_IVA, treatment: "taxed", category: "general", effectiveFrom: taxationDate("2026-01-01"), effectiveTo: null, legalBasis: "Service tax classification", classificationVersion: "service-tax-v1" }],
  });
}

function serviceRepository(foundProfile = serviceProfile(), rules: readonly TaxRule[] = [baseRule]): ServiceTaxationRepository {
  return {
    getProfile: async () => foundProfile,
    listRules: async () => rules,
    setTreatment: async () => { throw new Error("Not used by this query"); },
  };
}

test("resolves selected product IVA components from scoped profile and current legal rules", async () => {
  const useCase = new ResolveProductVenezuelanVat(repository(profile(), [baseRule]), configuration([baseRule, luxuryRule, paymentRule]));
  const decisions = await useCase.execute({
    actorUserId: userId("user-1"),
    organizationId: organizationId("organization-1"),
    companyId: companyId("company-1"),
    productId: product,
    operationDate: "2026-08-13",
    lineReference: "line-1",
    lineAmount: moneyFromDecimal("116", VES),
    roundingMode: "half_up",
    priceMode: "tax_inclusive",
    additionalComponents: [
      { ruleId: luxuryRule.id, source: { kind: "line", reference: "line-1" } },
      { ruleId: paymentRule.id, source: { kind: "payment", reference: "payment-1" }, taxableBase: moneyFromDecimal("50", VES) },
    ],
  });

  assert.deepEqual(decisions.map((decision) => decision.component), ["base", "luxury", "payment"]);
  assert.deepEqual(decisions.map((decision) => decision.amount.minorAmount), [1_600n, 1_500n, 150n]);
  assert.equal(decisions[0]?.taxableBase.minorAmount, 10_000n);
  assert.equal(decisions[1]?.taxableBase.minorAmount, 10_000n);
  assert.equal(decisions[2]?.taxableBase.minorAmount, 5_000n);
});

test("fails closed when a product profile or selected legal component is missing", async () => {
  const missingProfile = new ResolveProductVenezuelanVat(repository(null), configuration([baseRule]));
  const input = {
    actorUserId: userId("user-1"),
    organizationId: organizationId("organization-1"),
    companyId: companyId("company-1"),
    productId: product,
    operationDate: "2026-08-13",
    lineReference: "line-1",
    lineAmount: moneyFromDecimal("100", VES),
    roundingMode: "half_up" as const,
  };
  await assert.rejects(missingProfile.execute(input), (error: unknown) => error instanceof TaxationFailure && error.code === "TAXATION_PROFILE_NOT_FOUND");

  const missingRule = new ResolveProductVenezuelanVat(repository(), configuration([baseRule]));
  await assert.rejects(missingRule.execute({
    ...input,
    additionalComponents: [{ ruleId: taxRuleId("unknown-iva-rule"), source: { kind: "line", reference: "line-1" } }],
  }), (error: unknown) => error instanceof TaxationFailure && error.code === "TAXATION_RULE_MISSING");
});

test("rejects product profiles returned outside the authorized company", async () => {
  const useCase = new ResolveProductVenezuelanVat(
    repository(profile(companyId("company-2"))),
    configuration([baseRule]),
  );
  await assert.rejects(useCase.execute({
    actorUserId: userId("user-1"),
    organizationId: organizationId("organization-1"),
    companyId: companyId("company-1"),
    productId: product,
    operationDate: "2026-08-13",
    lineReference: "line-1",
    lineAmount: moneyFromDecimal("100", VES),
    roundingMode: "half_up",
  }), (error: unknown) => error instanceof TaxationFailure && error.code === "TAXATION_ACCESS_DENIED");
});

test("keeps legacy profile and shared-rule resolution when no company catalog exists", async () => {
  const legacyProfile = profile(companyId("company-1"), null);
  const legacyRule = taxRule({ ...baseRule, id: taxRuleId("legacy-ve-iva-16"), category: null });
  const useCase = new ResolveProductVenezuelanVat(
    repository(legacyProfile, [legacyRule]),
    configuration([], 0),
  );
  const decisions = await useCase.execute({
    actorUserId: userId("user-1"),
    organizationId: organizationId("organization-1"),
    companyId: companyId("company-1"),
    productId: product,
    operationDate: "2026-08-13",
    lineReference: "line-legacy",
    lineAmount: moneyFromDecimal("100", VES),
    roundingMode: "half_up",
  });
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0]?.amount.minorAmount, 1_600n);
});

test("resolves service IVA through the versioned company catalog and preserves service source", async () => {
  const useCase = new ResolveServiceVenezuelanVat(
    serviceRepository(),
    configuration([baseRule, luxuryRule]),
  );
  const decisions = await useCase.execute({
    actorUserId: userId("user-1"),
    organizationId: organizationId("organization-1"),
    companyId: companyId("company-1"),
    serviceCode: "CONSULTING",
    operationDate: "2026-08-13",
    lineReference: "service-line-1",
    lineAmount: moneyFromDecimal("100", VES),
    roundingMode: "half_up",
    additionalComponents: [{ ruleId: luxuryRule.id, source: { kind: "line", reference: "service-line-1" } }],
  });
  assert.equal(decisions.unitCode, "HUR");
  assert.equal(decisions.classificationVersion, "service-tax-v1");
  assert.equal(decisions.classificationLegalBasis, "Service tax classification");
  assert.deepEqual(decisions.determinations.map((decision) => decision.amount.minorAmount), [1_600n, 1_500n]);
  assert.deepEqual(decisions.determinations.map((decision) => decision.source.kind), ["line", "line"]);
});
