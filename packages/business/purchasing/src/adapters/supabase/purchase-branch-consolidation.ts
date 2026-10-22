import { currencyCode, exactDecimal } from "@kontave/monetary/domain";
import {
  PurchaseBranchConsolidationFailure,
  type PurchaseBranchConsolidation,
  type PurchaseBranchConsolidationQuery,
  type PurchaseBranchConsolidationReader,
} from "../../application/branch-consolidation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const decimal = z.string().refine((value) => {
  try {
    exactDecimal(value);
    return true;
  } catch {
    return false;
  }
}, { message: "Invalid exact decimal." });
const response = z.object({
  period: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  rows: z.array(z.object({
    branchId: z.string().uuid(), branchCode: z.string().min(1), branchName: z.string().min(1),
    documentType: z.string().min(1), transactionCurrencyCode: z.string().regex(/^[A-Z]{3}$/),
    documentCount: z.number().int().positive(), functionalSubtotal: decimal,
    functionalVatAmount: decimal, functionalTotal: decimal, functionalCurrency: z.literal("VES"),
  })),
  coverage: z.object({
    attributedConfirmedDocumentCount: z.number().int().nonnegative(),
    unattributedConfirmedDocumentCount: z.number().int().nonnegative().nullable(),
    includesUnattributed: z.boolean(),
  }),
  generatedAt: z.string().datetime({ offset: true }),
});

/** Supabase service credentials required to call the branch consolidation RPC. */
export interface SupabasePurchaseBranchConsolidationConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/** Server-side adapter for the branch-scoped purchasing consolidation query. */
export class SupabasePurchaseBranchConsolidationReader implements PurchaseBranchConsolidationReader {
  /**
   * Creates a reader whose service client remains inside the trusted server composition.
   * @param client - Supabase client permitted to execute the private reporting RPC.
   * @returns A reader bound to the supplied trusted Supabase client.
   */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc PurchaseBranchConsolidationReader.read} */
  async read(query: PurchaseBranchConsolidationQuery): Promise<PurchaseBranchConsolidation> {
    try {
      const { data, error } = await this.client.rpc("get_native_purchase_branch_consolidation", {
        p_actor_user_id: query.actorUserId,
        p_organization_id: query.organizationId,
        p_company_id: query.companyId,
        p_from: query.from,
        p_to: query.to,
        p_branch_ids: query.branchIds ?? null,
      });
      if (error) throw mapFailure(error.message, error);
      const parsed = response.safeParse(data);
      if (!parsed.success) throw new PurchaseBranchConsolidationFailure("PURCHASE_BRANCH_CONSOLIDATION_UNAVAILABLE", "Branch purchase consolidation returned malformed data.", { cause: parsed.error });
      if (parsed.data.period.from !== query.from || parsed.data.period.to !== query.to
        || parsed.data.coverage.includesUnattributed !== (parsed.data.coverage.unattributedConfirmedDocumentCount !== null)) {
        throw new PurchaseBranchConsolidationFailure("PURCHASE_BRANCH_CONSOLIDATION_UNAVAILABLE", "Branch purchase consolidation response does not match the requested scope.");
      }
      return Object.freeze({
        period: Object.freeze(parsed.data.period),
        rows: Object.freeze(parsed.data.rows.map((row) => Object.freeze({
          ...row,
          transactionCurrencyCode: currencyCode(row.transactionCurrencyCode),
          functionalSubtotal: exactDecimal(row.functionalSubtotal),
          functionalVatAmount: exactDecimal(row.functionalVatAmount),
          functionalTotal: exactDecimal(row.functionalTotal),
        }))),
        coverage: Object.freeze(parsed.data.coverage),
        generatedAt: parsed.data.generatedAt,
      });
    } catch (cause) {
      if (cause instanceof PurchaseBranchConsolidationFailure) throw cause;
      throw new PurchaseBranchConsolidationFailure("PURCHASE_BRANCH_CONSOLIDATION_UNAVAILABLE", "Branch purchase consolidation is unavailable.", { cause });
    }
  }
}

/**
 * Creates the trusted server reader for branch purchase consolidation.
 * @param configuration - Supabase URL and server-only service role key.
 * @returns A reader that validates database responses before exposing them.
 * @throws {PurchaseBranchConsolidationFailure} When the remote read fails or returns invalid data.
 */
export function createSupabasePurchaseBranchConsolidationReader(configuration: SupabasePurchaseBranchConsolidationConfiguration): PurchaseBranchConsolidationReader {
  return new SupabasePurchaseBranchConsolidationReader(createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
}

function mapFailure(message: string, cause: unknown): PurchaseBranchConsolidationFailure {
  if (message.includes("PURCHASE_BRANCH_CONSOLIDATION_ACCESS_DENIED")) return new PurchaseBranchConsolidationFailure("PURCHASE_BRANCH_CONSOLIDATION_ACCESS_DENIED", "Purchase branch consolidation access was denied.");
  if (message.includes("PURCHASE_BRANCH_CONSOLIDATION_INVALID")) return new PurchaseBranchConsolidationFailure("PURCHASE_BRANCH_CONSOLIDATION_INVALID", "Purchase branch consolidation query is invalid.");
  return new PurchaseBranchConsolidationFailure("PURCHASE_BRANCH_CONSOLIDATION_UNAVAILABLE", "Branch purchase consolidation is unavailable.", { cause });
}
