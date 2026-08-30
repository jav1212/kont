import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { companyId } from "@kontave/companies/domain";
import { exactDecimal } from "@kontave/monetary-domain";
import { productId, type ProductId } from "@kontave/products-domain";
import type {
  ProductTaxationRepository,
  SetProductTaxTreatmentInput,
  TaxationContext,
} from "@kontave/taxation-application";
import {
  ProductTaxProfile,
  TaxationFailure,
  productTaxProfileId,
  taxCode,
  taxRule,
  taxRuleId,
  taxationDate,
  type TaxCode,
  type TaxRule,
} from "@kontave/taxation-domain";
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
  productId: z.string(),
  jurisdiction: z.string(),
  version: z.number().int().positive(),
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

/** Supabase-backed product taxation repository. */
export class SupabaseProductTaxationRepository implements ProductTaxationRepository {
  /** @param client - Server-side Supabase client used by taxation RPCs. */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc ProductTaxationRepository.getProfile} */
  async getProfile(context: TaxationContext, id: ProductId): Promise<ProductTaxProfile | null> {
    const data = await this.rpc("get_native_product_tax_profile", {
      ...args(context),
      p_product_id: id,
    });
    if (data === null) return null;
    return decodeProfile(data);
  }

  /** {@inheritDoc ProductTaxationRepository.listRules} */
  async listRules(code: TaxCode, jurisdiction: string): Promise<readonly TaxRule[]> {
    const data = await this.rpc("list_native_tax_rules", {
      p_tax_code: code,
      p_jurisdiction: jurisdiction,
    });
    const result = ruleSchema.array().safeParse(data);
    if (!result.success) throw unavailable(result.error, "Taxation persistence returned invalid rules.");
    return result.data.map((value) => taxRule({
      id: taxRuleId(value.id),
      taxCode: taxCode(value.taxCode),
      jurisdiction: value.jurisdiction,
      treatment: value.treatment,
      rate: exactDecimal(value.rate),
      calculationMode: value.calculationMode,
      effectiveFrom: taxationDate(value.effectiveFrom),
      effectiveTo: value.effectiveTo ? taxationDate(value.effectiveTo) : null,
      legalBasis: value.legalBasis,
      version: value.version,
    }));
  }

  /** {@inheritDoc ProductTaxationRepository.setTreatment} */
  async setTreatment(input: SetProductTaxTreatmentInput): Promise<ProductTaxProfile> {
    const data = await this.rpc("set_native_product_tax_treatment", {
      ...args(input),
      p_product_id: input.productId,
      p_tax_code: input.taxCode,
      p_treatment: input.treatment,
      p_effective_from: input.effectiveFrom,
      p_legal_basis: input.legalBasis,
      p_expected_version: input.expectedVersion,
    });
    return decodeProfile(data);
  }

  private async rpc(name: string, input: Record<string, unknown>): Promise<unknown> {
    try {
      const { data, error } = await this.client.rpc(name, input);
      if (error) throw failure(error);
      return data;
    } catch (cause: unknown) {
      if (cause instanceof TaxationFailure) throw cause;
      throw unavailable(cause);
    }
  }
}

/** Credentials required by the server-side taxation adapter. */
export interface ProductTaxationSupabaseConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/**
 * Creates a stateless Supabase product-taxation repository.
 *
 * @param configuration - Supabase endpoint and service-role credential.
 * @returns A configured product-taxation repository.
 * @throws When the Supabase client rejects invalid construction parameters.
 */
export function createSupabaseProductTaxationRepository(
  configuration: ProductTaxationSupabaseConfiguration,
): SupabaseProductTaxationRepository {
  return new SupabaseProductTaxationRepository(createClient(
    configuration.url,
    configuration.serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  ));
}

function args(value: TaxationContext): Record<string, unknown> {
  return {
    p_actor_user_id: value.actorUserId,
    p_organization_id: value.organizationId,
    p_company_id: value.companyId,
  };
}

function decodeProfile(value: unknown): ProductTaxProfile {
  const result = profileSchema.safeParse(value);
  if (!result.success) throw unavailable(result.error, "Taxation persistence returned an invalid profile.");
  return mapProfile(result.data);
}

function mapProfile(value: z.infer<typeof profileSchema>): ProductTaxProfile {
  return new ProductTaxProfile({
    id: productTaxProfileId(value.id),
    companyId: companyId(value.companyId),
    productId: productId(value.productId),
    jurisdiction: value.jurisdiction,
    version: value.version,
    assignments: value.assignments.map((assignment) => ({
      taxCode: taxCode(assignment.taxCode),
      treatment: assignment.treatment,
      effectiveFrom: taxationDate(assignment.effectiveFrom),
      effectiveTo: assignment.effectiveTo ? taxationDate(assignment.effectiveTo) : null,
      legalBasis: assignment.legalBasis,
      classificationVersion: assignment.classificationVersion,
    })),
  });
}

function failure(error: { message: string }): TaxationFailure {
  for (const code of [
    "TAXATION_VERSION_CONFLICT",
    "TAXATION_PROFILE_NOT_FOUND",
    "TAXATION_PROFILE_INVALID",
  ] as const) {
    if (error.message.includes(code)) return new TaxationFailure(code, error.message, { cause: error });
  }
  return unavailable(error);
}

function unavailable(
  cause: unknown,
  message = "Taxation repository is unavailable.",
): TaxationFailure {
  return new TaxationFailure("TAXATION_REPOSITORY_UNAVAILABLE", message, { cause });
}
