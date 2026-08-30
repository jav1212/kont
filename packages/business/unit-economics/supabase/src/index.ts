import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  UnitEconomicsFailure,
  type ProductUnitEconomics,
  type ProductUnitEconomicsQuery,
  type UnitEconomicsReader,
} from "@kontave/unit-economics-application";
import { UnitOfMeasure } from "@kontave/products-domain";
import { z } from "zod";

const amountSchema = z.object({ amount: z.string(), currency: z.literal("VES") });
const quantitySchema = z.object({ value: z.string(), unit: z.nativeEnum(UnitOfMeasure) });
const aggregateSchema = z.object({
  weightedAverageUnitAmount: amountSchema,
  quantity: quantitySchema,
  observations: z.number().int().nonnegative(),
});
const resultSchema = z.object({
  period: z.object({ from: z.string(), to: z.string(), granularity: z.enum(["day", "week", "month"]) }),
  latestAcquisition: z.object({
    effectiveDate: z.string(),
    sourceUnitAmount: z.object({ amount: z.string(), currency: z.string() }),
    unitAmount: amountSchema,
    exchangeRate: z.string().nullable(),
    quantity: quantitySchema,
    reference: z.string().nullable(),
    documentId: z.string(),
  }).nullable(),
  points: z.array(z.object({
    bucketStart: z.string(),
    acquisition: aggregateSchema.nullable(),
    realizedSale: aggregateSchema.nullable(),
  })),
  coverage: z.object({
    confirmedAcquisitions: z.number().int().nonnegative(),
    confirmedSales: z.number().int().nonnegative(),
    legacyRecordedOutboundPrices: z.number().int().nonnegative(),
  }),
  generatedAt: z.string(),
});

/** Supabase-backed unit-economics reader. */
export class SupabaseUnitEconomicsReader implements UnitEconomicsReader {
  /**
   * Creates a reader over a Supabase client.
   *
   * @param client - Server-side client used to invoke the reporting RPC.
   */
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Reads and validates a product unit-economics projection.
   *
   * @param query - Validated actor, organization, company, product and period scope.
   * @returns The decoded projection returned by the reporting RPC.
   * @throws {UnitEconomicsFailure} When the RPC rejects, reports an expected failure, or returns invalid data.
   */
  async read(query: ProductUnitEconomicsQuery): Promise<ProductUnitEconomics> {
    try {
      const { data, error } = await this.client.rpc("get_native_product_unit_economics", {
        p_actor_user_id: query.actorUserId,
        p_organization_id: query.organizationId,
        p_company_id: query.companyId,
        p_product_id: query.productId,
        p_from: query.from,
        p_to: query.to,
        p_granularity: query.granularity,
      });
      if (error) throw translate(error);
      const parsed = resultSchema.safeParse(data);
      if (!parsed.success) {
        throw new UnitEconomicsFailure("UNIT_ECONOMICS_UNAVAILABLE", "Unit economics returned invalid data.", { cause: parsed.error });
      }
      return parsed.data;
    } catch (cause: unknown) {
      if (cause instanceof UnitEconomicsFailure) throw cause;
      throw new UnitEconomicsFailure("UNIT_ECONOMICS_UNAVAILABLE", "Unit economics are unavailable.", { cause });
    }
  }
}

/** Credentials required by the server-side unit-economics adapter. */
export interface SupabaseUnitEconomicsConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/**
 * Creates a server-side Supabase unit-economics reader without session state.
 *
 * @param configuration - Supabase endpoint and service-role credential.
 * @returns A configured unit-economics reader.
 * @throws When the Supabase client rejects invalid construction parameters.
 */
export function createSupabaseUnitEconomicsReader(configuration: SupabaseUnitEconomicsConfiguration): SupabaseUnitEconomicsReader {
  return new SupabaseUnitEconomicsReader(createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
}

function translate(error: { readonly message: string }): UnitEconomicsFailure {
  if (error.message.includes("PRODUCT_INSIGHTS_NOT_FOUND")) {
    return new UnitEconomicsFailure("UNIT_ECONOMICS_NOT_FOUND", error.message, { cause: error });
  }
  if (error.message.includes("PRODUCT_INSIGHTS_INVALID")) {
    return new UnitEconomicsFailure("UNIT_ECONOMICS_INVALID", error.message, { cause: error });
  }
  return new UnitEconomicsFailure("UNIT_ECONOMICS_UNAVAILABLE", "Unit economics are unavailable.", { cause: error });
}
