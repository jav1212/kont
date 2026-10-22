import {
  SalesBranchConsolidationFailure,
  type SalesBranchConsolidation,
  type SalesBranchConsolidationQuery,
  type SalesBranchConsolidationReader,
} from "../../application/branch-consolidation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const decimal = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const response = z.object({
  period: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  rows: z.array(z.object({
    branchId: z.string().uuid(), branchCode: z.string().min(1), branchName: z.string().min(1),
    documentType: z.string().min(1), currencyCode: z.string().regex(/^[A-Z]{3}$/),
    documentCount: z.number().int().positive(), subtotal: z.string().regex(decimal),
    vatAmount: z.string().regex(decimal), total: z.string().regex(decimal),
  })),
  coverage: z.object({
    attributedConfirmedDocumentCount: z.number().int().nonnegative(),
    unattributedConfirmedDocumentCount: z.number().int().nonnegative().nullable(),
    includesUnattributed: z.boolean(),
  }),
  generatedAt: z.string().datetime({ offset: true }),
});

/** Supabase service credentials required to call the branch consolidation RPC. */
export interface SupabaseSalesBranchConsolidationConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/** Server-side adapter for the branch-scoped sales consolidation query. */
export class SupabaseSalesBranchConsolidationReader implements SalesBranchConsolidationReader {
  /**
   * Creates a reader whose service client remains inside the trusted server composition.
   * @param client - Supabase client permitted to execute the private reporting RPC.
   */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc SalesBranchConsolidationReader.read} */
  async read(query: SalesBranchConsolidationQuery): Promise<SalesBranchConsolidation> {
    try {
      const { data, error } = await this.client.rpc("get_native_sales_branch_consolidation", {
        p_actor_user_id: query.actorUserId,
        p_organization_id: query.organizationId,
        p_company_id: query.companyId,
        p_from: query.from,
        p_to: query.to,
        p_branch_ids: query.branchIds ?? null,
      });
      if (error) throw mapFailure(error.message, error);
      const parsed = response.safeParse(data);
      if (!parsed.success) throw new SalesBranchConsolidationFailure("SALES_BRANCH_CONSOLIDATION_UNAVAILABLE", "Branch consolidation returned malformed data.", { cause: parsed.error });
      if (parsed.data.period.from !== query.from || parsed.data.period.to !== query.to
        || parsed.data.coverage.includesUnattributed !== (parsed.data.coverage.unattributedConfirmedDocumentCount !== null)) {
        throw new SalesBranchConsolidationFailure("SALES_BRANCH_CONSOLIDATION_UNAVAILABLE", "Branch consolidation response does not match the requested scope.");
      }
      return Object.freeze({
        period: Object.freeze(parsed.data.period),
        rows: Object.freeze(parsed.data.rows.map((row) => Object.freeze(row))),
        coverage: Object.freeze(parsed.data.coverage),
        generatedAt: parsed.data.generatedAt,
      });
    } catch (cause) {
      if (cause instanceof SalesBranchConsolidationFailure) throw cause;
      throw new SalesBranchConsolidationFailure("SALES_BRANCH_CONSOLIDATION_UNAVAILABLE", "Branch sales consolidation is unavailable.", { cause });
    }
  }
}

/**
 * Creates the trusted server reader for branch sales consolidation.
 * @param configuration - Supabase URL and server-only service role key.
 * @returns A reader that validates database responses before exposing them.
 * @throws {SalesBranchConsolidationFailure} When the remote read fails or returns invalid data.
 */
export function createSupabaseSalesBranchConsolidationReader(configuration: SupabaseSalesBranchConsolidationConfiguration): SalesBranchConsolidationReader {
  return new SupabaseSalesBranchConsolidationReader(createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
}

function mapFailure(message: string, cause: unknown): SalesBranchConsolidationFailure {
  if (message.includes("SALES_BRANCH_CONSOLIDATION_ACCESS_DENIED")) return new SalesBranchConsolidationFailure("SALES_BRANCH_CONSOLIDATION_ACCESS_DENIED", "Sales branch consolidation access was denied.");
  if (message.includes("SALES_BRANCH_CONSOLIDATION_INVALID")) return new SalesBranchConsolidationFailure("SALES_BRANCH_CONSOLIDATION_INVALID", "Sales branch consolidation query is invalid.");
  return new SalesBranchConsolidationFailure("SALES_BRANCH_CONSOLIDATION_UNAVAILABLE", "Branch sales consolidation is unavailable.", { cause });
}
