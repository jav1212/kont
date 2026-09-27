import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { companyId } from "@kontave/companies/domain";
import { exactDecimal } from "@kontave/monetary/domain";
import {
  ServiceTaxProfile,
  TaxationFailure,
  serviceTaxProfileId,
  taxCode,
  taxRule,
  taxRuleId,
  taxationDate as taxDate,
  type TaxCode,
  type TaxRule,
} from "../../domain";
import type {
  ServiceTaxationRepository,
  SetServiceTaxTreatmentInput,
  TaxationContext,
} from "../../application";
import { z } from "zod";

const assignmentSchema = z.object({
  taxCode: z.string(),
  treatment: z.enum(["taxed", "exempt", "exonerated", "not_subject"]),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  legalBasis: z.string(),
  classificationVersion: z.string(),
});
const profileSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  serviceCode: z.string(),
  unitCode: z.string(),
  jurisdiction: z.string(),
  version: z.number().int().nonnegative(),
  assignments: z.array(assignmentSchema),
});
const ruleSchema = z.object({
  id: z.string(),
  taxCode: z.string(),
  jurisdiction: z.string(),
  treatment: z.enum(["taxed", "exempt", "exonerated", "not_subject"]),
  rate: z.string(),
  calculationMode: z.enum(["tax_exclusive", "tax_inclusive"]),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  legalBasis: z.string(),
  version: z.string(),
});

/** Supabase RPC adapter for company-scoped service tax classifications. */
export class SupabaseServiceTaxationRepository implements ServiceTaxationRepository {
  /**
   * Creates the service-classification persistence adapter.
   * @param client - Server-side Supabase client restricted to service taxation RPCs.
   * @returns No value; the adapter is available on the constructed instance.
   * @throws {TaxationFailure} When later persistence operations fail.
   */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc ServiceTaxationRepository.getProfile} */
  async getProfile(context: TaxationContext, serviceCode: string): Promise<ServiceTaxProfile | null> {
    const result = await this.rpc("get_native_service_tax_profile", {
      ...scopeArgs(context),
      p_service_code: serviceCode,
    });
    if (result === null) return null;
    return decodeProfile(result);
  }

  /** {@inheritDoc ServiceTaxationRepository.listRules} */
  async listRules(code: TaxCode, jurisdiction: string): Promise<readonly TaxRule[]> {
    const result = await this.rpc("list_native_tax_rules", { p_tax_code: code, p_jurisdiction: jurisdiction });
    const parsed = ruleSchema.array().safeParse(result);
    if (!parsed.success) throw unavailable(parsed.error, "Tax rule persistence returned invalid data.");
    return parsed.data.map((rule) => taxRule({
      id: taxRuleId(rule.id),
      taxCode: taxCode(rule.taxCode),
      jurisdiction: rule.jurisdiction,
      treatment: rule.treatment,
      rate: exactDecimal(rule.rate),
      calculationMode: rule.calculationMode,
      effectiveFrom: taxDate(rule.effectiveFrom),
      effectiveTo: rule.effectiveTo === null ? null : taxDate(rule.effectiveTo),
      legalBasis: rule.legalBasis,
      version: rule.version,
    }));
  }

  /** {@inheritDoc ServiceTaxationRepository.setTreatment} */
  async setTreatment(input: SetServiceTaxTreatmentInput): Promise<ServiceTaxProfile> {
    return decodeProfile(await this.rpc("set_native_service_tax_treatment", {
      ...scopeArgs(input),
      p_service_code: input.serviceCode,
      p_unit_code: input.unitCode,
      p_jurisdiction: input.jurisdiction,
      p_tax_code: input.taxCode,
      p_treatment: input.treatment,
      p_effective_from: input.effectiveFrom,
      p_legal_basis: input.legalBasis,
      p_expected_version: input.expectedVersion,
    }));
  }

  private async rpc(name: string, input: Record<string, unknown>): Promise<unknown> {
    try {
      const { data, error } = await this.client.rpc(name, input);
      if (error) throw mapFailure(error.message);
      return data;
    } catch (cause: unknown) {
      if (cause instanceof TaxationFailure) throw cause;
      throw unavailable(cause);
    }
  }
}

/**
 * Creates a stateless Supabase service-taxation repository.
 * @param configuration - Supabase URL and server credential.
 * @returns The service classification persistence adapter.
 * @throws When Supabase client configuration is invalid.
 */
export function createSupabaseServiceTaxationRepository(configuration: {
  readonly url: string;
  readonly serviceRoleKey: string;
}): SupabaseServiceTaxationRepository {
  const client = createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return new SupabaseServiceTaxationRepository(client);
}

function scopeArgs(context: TaxationContext): Record<string, unknown> {
  return {
    p_actor_user_id: context.actorUserId,
    p_organization_id: context.organizationId,
    p_company_id: context.companyId,
  };
}

function decodeProfile(value: unknown): ServiceTaxProfile {
  const result = profileSchema.safeParse(value);
  if (!result.success) throw unavailable(result.error, "Service tax profile persistence returned invalid data.");
  return new ServiceTaxProfile({
    id: serviceTaxProfileId(result.data.id),
    companyId: companyId(result.data.companyId),
    serviceCode: result.data.serviceCode,
    unitCode: result.data.unitCode,
    jurisdiction: result.data.jurisdiction,
    version: result.data.version,
    assignments: result.data.assignments.map((assignment) => ({
      taxCode: taxCode(assignment.taxCode),
      treatment: assignment.treatment,
      effectiveFrom: taxDate(assignment.effectiveFrom),
      effectiveTo: assignment.effectiveTo === null ? null : taxDate(assignment.effectiveTo),
      legalBasis: assignment.legalBasis,
      classificationVersion: assignment.classificationVersion,
    })),
  });
}

function mapFailure(message: string): TaxationFailure {
  for (const code of ["TAXATION_VERSION_CONFLICT", "TAXATION_PROFILE_NOT_FOUND", "TAXATION_PROFILE_INVALID"] as const) {
    if (message.includes(code)) return new TaxationFailure(code, message);
  }
  return unavailable(new Error(message));
}

function unavailable(cause: unknown, message = "Service taxation persistence is unavailable."): TaxationFailure {
  return new TaxationFailure("TAXATION_REPOSITORY_UNAVAILABLE", message, { cause });
}
