import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { companyId } from "@kontave/companies/domain";
import { currencyCode } from "@kontave/monetary-domain";
import type { PricingContext, ProductSalePricingRepository } from "@kontave/pricing-application";
import {
  fixedSalePricing,
  markupSalePricing,
  PricingFailure,
  ProductSalePricing,
  type SalePricingPolicy,
} from "@kontave/pricing-domain";
import { productId, type ProductId } from "@kontave/products-domain";
import { z } from "zod";

const policySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("fixed"), amount: z.string(), currency: z.string() }),
  z.object({ mode: z.literal("markup"), percentage: z.string(), currency: z.string() }),
]);
const rowSchema = z.object({
  companyId: z.string(),
  productId: z.string(),
  policy: policySchema.nullable(),
  version: z.number().int().positive(),
  updatedAt: z.string(),
});

/** Supabase-backed product sale-pricing repository. */
export class SupabaseProductSalePricingRepository implements ProductSalePricingRepository {
  /** @param client - Server-side Supabase client used by pricing RPCs. */
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Loads and validates sale pricing for a product.
   *
   * @param context - Actor, organization and company scope.
   * @param id - Product identifier.
   * @returns The decoded aggregate, or `null` when none exists.
   * @throws {PricingFailure} When the RPC or returned data fails.
   */
  async get(context: PricingContext, id: ProductId): Promise<ProductSalePricing | null> {
    const data = await this.rpc("get_native_product_sale_pricing", { ...args(context), p_product_id: id });
    return data === null ? null : decode(data);
  }

  /**
   * Saves and validates a product sale-pricing policy.
   *
   * @param context - Actor, organization and company scope.
   * @param id - Product identifier.
   * @param value - New policy or `null`.
   * @param expectedVersion - Version that must currently be stored.
   * @returns The decoded authoritative aggregate.
   * @throws {PricingFailure} When validation, access, persistence or concurrency fails.
   */
  async save(
    context: PricingContext,
    id: ProductId,
    value: SalePricingPolicy | null,
    expectedVersion: number,
  ): Promise<ProductSalePricing> {
    const data = await this.rpc("save_native_product_sale_pricing", {
      ...args(context),
      p_product_id: id,
      p_policy: value,
      p_expected_version: expectedVersion,
    });
    return decode(data);
  }

  private async rpc(name: string, input: Record<string, unknown>): Promise<unknown> {
    try {
      const { data, error } = await this.client.rpc(name, input);
      if (error) throw failure(error);
      return data;
    } catch (cause: unknown) {
      if (cause instanceof PricingFailure) throw cause;
      throw new PricingFailure("PRICING_REPOSITORY_UNAVAILABLE", "Pricing repository is unavailable.", { cause });
    }
  }
}

/** Credentials required by the server-side pricing adapter. */
export interface SupabaseProductSalePricingConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/**
 * Creates a server-side Supabase sale-pricing repository without session state.
 *
 * @param configuration - Supabase endpoint and service-role credential.
 * @returns A configured product sale-pricing repository.
 * @throws When the Supabase client rejects invalid construction parameters.
 */
export function createSupabaseProductSalePricingRepository(
  configuration: SupabaseProductSalePricingConfiguration,
): SupabaseProductSalePricingRepository {
  return new SupabaseProductSalePricingRepository(createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
}

function args(value: PricingContext): Record<string, unknown> {
  return {
    p_actor_user_id: value.actorUserId,
    p_organization_id: value.organizationId,
    p_company_id: value.companyId,
  };
}

function map(value: z.infer<typeof rowSchema>): ProductSalePricing {
  const policy = value.policy;
  return new ProductSalePricing({
    companyId: companyId(value.companyId),
    productId: productId(value.productId),
    policy: policy === null
      ? null
      : policy.mode === "fixed"
        ? fixedSalePricing(policy.amount, currencyCode(policy.currency))
        : markupSalePricing(policy.percentage, currencyCode(policy.currency)),
    version: value.version,
    updatedAt: value.updatedAt,
  });
}

function decode(value: unknown): ProductSalePricing {
  const result = rowSchema.safeParse(value);
  if (!result.success) {
    throw new PricingFailure("PRICING_REPOSITORY_UNAVAILABLE", "Pricing repository returned invalid data.", {
      cause: result.error,
    });
  }
  return map(result.data);
}

function failure(error: { readonly message: string }): PricingFailure {
  for (const code of ["PRICING_VERSION_CONFLICT", "PRICING_PRODUCT_NOT_FOUND", "PRICING_INVALID"] as const) {
    if (error.message.includes(code)) return new PricingFailure(code, error.message, { cause: error });
  }
  return new PricingFailure("PRICING_REPOSITORY_UNAVAILABLE", "Pricing repository is unavailable.", { cause: error });
}
