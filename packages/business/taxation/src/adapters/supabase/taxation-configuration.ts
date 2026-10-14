import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { companyId } from "@kontave/companies/domain";
import { exactDecimal } from "@kontave/monetary/domain";
import { z } from "zod";
import type { CompanyTaxRuleCatalog, SaveCompanyTaxRuleCatalogInput, SaveTaxCounterpartyFiscalProfileInput, TaxationConfigurationRepository, TaxationContext } from "../../application";
import { legacyRateSlot, taxCounterpartyFiscalProfile, taxRuleCategory, taxRule, taxRuleId, taxationDate, TaxationFailure, type TaxCounterpartyFiscalProfile } from "../../domain";

const rule = z.object({ id: z.string(), taxCode: z.string(), jurisdiction: z.string(), treatment: z.enum(["taxed", "zero_rated", "exempt", "exonerated", "not_subject"]), rate: z.string(), calculationMode: z.enum(["tax_exclusive", "tax_inclusive"]), effectiveFrom: z.string(), effectiveTo: z.string().nullable(), legalBasis: z.string(), version: z.string(), category: z.string().nullable(), legacyRateSlot: z.string().nullable().optional(), component: z.enum(["base", "luxury", "payment"]).optional() });
const catalog = z.object({ companyId: z.string(), version: z.number().int().nonnegative(), rules: z.array(rule) });
const counterparty = z.object({ companyId: z.string(), counterpartyId: z.string(), contributorStatus: z.enum(["ordinary", "formal", "occasional", "unverified"]), residenceStatus: z.enum(["domestic", "import_goods", "foreign_service", "unverified"]), effectiveFrom: z.string(), effectiveTo: z.string().nullable(), legalBasis: z.string(), evidenceReference: z.string(), version: z.number().int().nonnegative() });

/** Service-role RPC adapter for company tax configuration; every call carries an actor and organization scope. */
export class SupabaseTaxationConfigurationRepository implements TaxationConfigurationRepository {
  /** @param client - Server-only Supabase client. @returns No value. */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc TaxationConfigurationRepository.getCompanyTaxRuleCatalog} */
  async getCompanyTaxRuleCatalog(context: TaxationContext, catalogVersion?: number): Promise<CompanyTaxRuleCatalog> { return decodeCatalog(await this.rpc(catalogVersion === undefined ? "get_native_company_tax_rule_catalog" : "get_native_company_tax_rule_catalog_version", { ...scope(context), ...(catalogVersion === undefined ? {} : { p_catalog_version: catalogVersion }) })); }
  /** {@inheritDoc TaxationConfigurationRepository.saveCompanyTaxRuleCatalog} */
  async saveCompanyTaxRuleCatalog(input: SaveCompanyTaxRuleCatalogInput): Promise<CompanyTaxRuleCatalog> {
    return decodeCatalog(await this.rpc("save_native_company_tax_rule_catalog", { ...scope(input), p_expected_version: input.expectedVersion, p_idempotency_key: input.idempotencyKey, p_rules: input.rules.map(encodeRule) }));
  }
  /** {@inheritDoc TaxationConfigurationRepository.getCounterpartyFiscalProfile} */
  async getCounterpartyFiscalProfile(context: TaxationContext, counterpartyId: string, effectiveDate: string): Promise<TaxCounterpartyFiscalProfile | null> {
    const value = await this.rpc("get_native_tax_counterparty_profile", { ...scope(context), p_counterparty_id: counterpartyId, p_effective_date: effectiveDate });
    return value === null ? null : decodeCounterparty(value);
  }
  /** {@inheritDoc TaxationConfigurationRepository.saveCounterpartyFiscalProfile} */
  async saveCounterpartyFiscalProfile(input: SaveTaxCounterpartyFiscalProfileInput): Promise<TaxCounterpartyFiscalProfile> {
    return decodeCounterparty(await this.rpc("save_native_tax_counterparty_profile", { ...scope(input), p_counterparty_id: input.counterpartyId, p_contributor_status: input.contributorStatus, p_residence_status: input.residenceStatus, p_effective_from: input.effectiveFrom, p_effective_to: input.effectiveTo, p_legal_basis: input.legalBasis, p_evidence_reference: input.evidenceReference, p_expected_version: input.expectedVersion, p_idempotency_key: input.idempotencyKey }));
  }
  private async rpc(name: string, args: Record<string, unknown>): Promise<unknown> { try { const { data, error } = await this.client.rpc(name, args); if (error) throw mapped(error.message); return data; } catch (cause) { if (cause instanceof TaxationFailure) throw cause; throw new TaxationFailure("TAXATION_REPOSITORY_UNAVAILABLE", "Taxation configuration persistence is unavailable.", { cause }); } }
}

/** @param configuration - Server endpoint and service-role credential. @returns The taxation configuration adapter. */
export function createSupabaseTaxationConfigurationRepository(configuration: { readonly url: string; readonly serviceRoleKey: string }): SupabaseTaxationConfigurationRepository { return new SupabaseTaxationConfigurationRepository(createClient(configuration.url, configuration.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })); }

function scope(context: TaxationContext): Record<string, unknown> { return { p_actor_user_id: context.actorUserId, p_organization_id: context.organizationId, p_company_id: context.companyId }; }
function decodeCatalog(value: unknown): CompanyTaxRuleCatalog { const parsed = catalog.safeParse(value); if (!parsed.success) throw unavailable(parsed.error); return { companyId: companyId(parsed.data.companyId), version: parsed.data.version, rules: parsed.data.rules.map((item) => taxRule({ id: taxRuleId(item.id), taxCode: item.taxCode as never, jurisdiction: item.jurisdiction, treatment: item.treatment, rate: exactDecimal(item.rate), calculationMode: item.calculationMode, effectiveFrom: taxationDate(item.effectiveFrom), effectiveTo: item.effectiveTo === null ? null : taxationDate(item.effectiveTo), legalBasis: item.legalBasis, version: item.version, category: item.category === null ? null : taxRuleCategory(item.category), legacyRateSlot: item.legacyRateSlot === undefined || item.legacyRateSlot === null ? null : legacyRateSlot(item.legacyRateSlot), component: item.component ?? "base" })) }; }
function decodeCounterparty(value: unknown): TaxCounterpartyFiscalProfile { const parsed = counterparty.safeParse(value); if (!parsed.success) throw unavailable(parsed.error); return taxCounterpartyFiscalProfile({ ...parsed.data, companyId: companyId(parsed.data.companyId), effectiveFrom: taxationDate(parsed.data.effectiveFrom), effectiveTo: parsed.data.effectiveTo === null ? null : taxationDate(parsed.data.effectiveTo) }); }
function encodeRule(value: CompanyTaxRuleCatalog["rules"][number]): Record<string, unknown> { return { id: value.id, taxCode: value.taxCode, jurisdiction: value.jurisdiction, treatment: value.treatment, rate: value.rate, calculationMode: value.calculationMode, effectiveFrom: value.effectiveFrom, effectiveTo: value.effectiveTo, legalBasis: value.legalBasis, version: value.version, category: value.category ?? null, legacyRateSlot: value.legacyRateSlot ?? null, component: value.component ?? "base" }; }
function mapped(message: string): TaxationFailure { if (message.includes("TAXATION_IDEMPOTENCY_CONFLICT")) return new TaxationFailure("TAXATION_IDEMPOTENCY_CONFLICT", message); if (message.includes("TAXATION_VERSION_CONFLICT")) return new TaxationFailure("TAXATION_VERSION_CONFLICT", message); if (message.includes("TAXATION_ACCESS_DENIED")) return new TaxationFailure("TAXATION_ACCESS_DENIED", message); return unavailable(new Error(message)); }
function unavailable(cause: unknown): TaxationFailure { return new TaxationFailure("TAXATION_REPOSITORY_UNAVAILABLE", "Taxation configuration persistence returned invalid data.", { cause }); }
