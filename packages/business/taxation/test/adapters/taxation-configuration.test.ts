import assert from "node:assert/strict";
import { test } from "node:test";
import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { exactDecimal } from "@kontave/monetary/domain";
import { taxCode, taxRule, taxRuleId, taxationDate } from "../../src/domain";
import { SupabaseTaxationConfigurationRepository } from "../../src/adapters/supabase/taxation-configuration";
import { SupabaseProductTaxationRepository } from "../../src/adapters/supabase";
import { SupabaseServiceTaxationRepository } from "../../src/adapters/supabase/service-taxation";

const context = { actorUserId: userId("actor"), organizationId: organizationId("organization"), companyId: companyId("company") };
const companyRule = taxRule({
  id: taxRuleId("iva-pago"), taxCode: taxCode("IVA"), jurisdiction: "VE", treatment: "taxed",
  rate: exactDecimal("3"), calculationMode: "tax_exclusive", effectiveFrom: taxationDate("2026-01-01"),
  effectiveTo: null, legalBasis: "Configured authority", version: "rule-v1", category: "payment_surcharge",
  legacyRateSlot: "a2", component: "payment",
});

test("Supabase configuration preserves a distinct legal component on read and write", async () => {
  let rpcName = "";
  let savedRules: readonly Record<string, unknown>[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcName = name;
      if (name === "save_native_company_tax_rule_catalog") {
        savedRules = args.p_rules as readonly Record<string, unknown>[];
      }
      return {
        data: { companyId: "company", version: 1, rules: [{
          id: "iva-pago", taxCode: "IVA", jurisdiction: "VE", treatment: "taxed", rate: "3",
          calculationMode: "tax_exclusive", effectiveFrom: "2026-01-01", effectiveTo: null,
          legalBasis: "Configured authority", version: "rule-v1", category: "payment_surcharge",
          legacyRateSlot: "a2", component: "payment",
        }] },
        error: null,
      };
    },
  } as never;
  const repository = new SupabaseTaxationConfigurationRepository(client);

  const saved = await repository.saveCompanyTaxRuleCatalog({ ...context, expectedVersion: 0, idempotencyKey: "save-tax-rule-1", rules: [companyRule] });
  assert.equal(rpcName, "save_native_company_tax_rule_catalog");
  assert.equal(saved.rules[0]?.component, "payment");
  assert.equal(saved.rules[0]?.legacyRateSlot, "a2");
  assert.equal(savedRules[0]?.component, "payment");
  assert.equal(savedRules[0]?.legacyRateSlot, "a2");
});

test("product and service rule readers preserve configured components", async () => {
  const raw = [{
    id: "iva-luxury", taxCode: "IVA", jurisdiction: "VE", treatment: "taxed", rate: "15",
    calculationMode: "tax_exclusive", effectiveFrom: "2026-01-01", effectiveTo: null,
    legalBasis: "Configured authority", version: "rule-v1", category: "luxury_surcharge",
    legacyRateSlot: "a3", component: "luxury",
  }];
  const client = { rpc: async () => ({ data: raw, error: null }) } as never;
  const [productRule] = await new SupabaseProductTaxationRepository(client).listRules(taxCode("IVA"), "VE");
  const [serviceRule] = await new SupabaseServiceTaxationRepository(client).listRules(taxCode("IVA"), "VE");
  assert.equal(productRule?.component, "luxury");
  assert.equal(productRule?.legacyRateSlot, "a3");
  assert.equal(serviceRule?.component, "luxury");
  assert.equal(serviceRule?.legacyRateSlot, "a3");
});

test("configuration adapter preserves typed idempotency conflicts", async () => {
  const client = { rpc: async () => ({ data: null, error: { message: "TAXATION_IDEMPOTENCY_CONFLICT" } }) } as never;
  const repository = new SupabaseTaxationConfigurationRepository(client);
  await assert.rejects(
    () => repository.saveCounterpartyFiscalProfile({
      ...context, counterpartyId: "supplier", contributorStatus: "formal", residenceStatus: "domestic",
      effectiveFrom: "2026-01-01", effectiveTo: null, legalBasis: "reviewed", evidenceReference: "doc-1",
      expectedVersion: 0, idempotencyKey: "counterparty-key",
    }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "TAXATION_IDEMPOTENCY_CONFLICT",
  );
});
