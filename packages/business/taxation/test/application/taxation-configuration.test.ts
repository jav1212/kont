import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { ManageTaxationConfiguration, type TaxationConfigurationRepository } from "../../src/application";
import { exactDecimal } from "@kontave/monetary/domain";
import { taxCode, taxRule, taxRuleId, taxationDate, type TaxCounterpartyFiscalProfile } from "../../src/domain";

const context = { actorUserId: userId("actor"), organizationId: organizationId("organization"), companyId: companyId("company") };

test("configuration rejects missing idempotency keys before persistence", async () => {
  let called = false;
  const repository = { saveCompanyTaxRuleCatalog: async () => { called = true; return {} as never; } } as unknown as TaxationConfigurationRepository;
  await assert.rejects(() => new ManageTaxationConfiguration(repository).saveCompanyTaxRuleCatalog({ ...context, expectedVersion: 0, idempotencyKey: " ", rules: [] }), { code: "TAXATION_IDEMPOTENCY_INVALID" });
  assert.equal(called, false);
});

test("configuration persists explicit counterparty statuses without inferring them", async () => {
  const expected: TaxCounterpartyFiscalProfile = { companyId: context.companyId, counterpartyId: "supplier", contributorStatus: "formal", residenceStatus: "foreign_service", effectiveFrom: "2026-01-01", effectiveTo: null, legalBasis: "proof", evidenceReference: "file-1", version: 1 };
  const repository = { saveCounterpartyFiscalProfile: async () => expected } as unknown as TaxationConfigurationRepository;
  const saved = await new ManageTaxationConfiguration(repository).saveCounterpartyFiscalProfile({ ...context, ...expected, expectedVersion: 0, idempotencyKey: "counterparty-1" });
  assert.equal(saved.residenceStatus, "foreign_service");
});

test("operation presentation requires an explicit included or excluded mode", () => {
  const manager = new ManageTaxationConfiguration({} as TaxationConfigurationRepository);
  assert.equal(manager.operationPresentation({ priceMode: "tax_inclusive", category: "general" }).priceMode, "tax_inclusive");
  assert.throws(() => manager.operationPresentation({ priceMode: "unknown" as never, category: null }));
});

test("configuration forwards an explicit historic catalogue version without replacing it", async () => {
  let requestedVersion: number | undefined;
  const repository = { getCompanyTaxRuleCatalog: async (_context: unknown, version?: number) => { requestedVersion = version; return { companyId: context.companyId, version: version ?? 0, rules: [] }; } } as unknown as TaxationConfigurationRepository;
  const result = await new ManageTaxationConfiguration(repository).getCompanyTaxRuleCatalog(context, 2);
  assert.equal(requestedVersion, 2);
  assert.equal(result.version, 2);
});

test("configuration rejects overlapping legal selectors before persistence", async () => {
  let saved = false;
  const rule = (id: string, from: string) => taxRule({ id: taxRuleId(id), taxCode: taxCode("IVA"), jurisdiction: "VE", treatment: "taxed", rate: exactDecimal("16"), calculationMode: "tax_exclusive", effectiveFrom: taxationDate(from), effectiveTo: null, legalBasis: "basis", version: id, category: "general", legacyRateSlot: "a1" });
  const repository = { saveCompanyTaxRuleCatalog: async () => { saved = true; return {} as never; } } as unknown as TaxationConfigurationRepository;
  await assert.rejects(() => new ManageTaxationConfiguration(repository).saveCompanyTaxRuleCatalog({ ...context, expectedVersion: 0, idempotencyKey: "overlap-1", rules: [rule("first", "2026-01-01"), rule("second", "2026-02-01")] }), { code: "TAXATION_RULE_AMBIGUOUS" });
  assert.equal(saved, false);
});

test("configuration treats an unspecified legacy slot as overlapping every slot", async () => {
  const rule = (id: string, slot: "a1" | null) => taxRule({ id: taxRuleId(id), taxCode: taxCode("IVA"), jurisdiction: "VE", treatment: "taxed", rate: exactDecimal("16"), calculationMode: "tax_exclusive", effectiveFrom: taxationDate("2026-01-01"), effectiveTo: null, legalBasis: "basis", version: id, category: "general", legacyRateSlot: slot });
  const repository = { saveCompanyTaxRuleCatalog: async () => ({ companyId: context.companyId, version: 1, rules: [] }) } as unknown as TaxationConfigurationRepository;
  await assert.rejects(() => new ManageTaxationConfiguration(repository).saveCompanyTaxRuleCatalog({ ...context, expectedVersion: 0, idempotencyKey: "wildcard-slot", rules: [rule("generic", null), rule("a1", "a1")] }), { code: "TAXATION_RULE_AMBIGUOUS" });
});
