import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { companyId } from "@kontave/companies/domain";
import type {
  IssuedSalesDeliveryNoteWithDocumentSeries,
  IssueSalesDeliveryNoteWithDocumentSeriesCommand,
  SalesDeliveryNoteDocumentSeriesIssuanceRepository,
} from "../../application";
import { IssueSalesDeliveryNoteWithDocumentSeries } from "../../application/issue-sales-delivery-note-with-document-series";
import { SalesFailure } from "../../domain";

const issuance = z.object({
  deliveryNoteId: z.string().min(1), companyId: z.string().min(1), status: z.literal("confirmed"),
  seriesId: z.string().uuid(), displayNumber: z.string().min(1).max(128),
  number: z.number().int().positive().max(99_999_999), replayed: z.boolean(),
});

/** Supabase adapter for the RPC that confirms a delivery note and assigns its configured series number. */
export class SupabaseSalesDeliveryNoteDocumentSeriesIssuanceRepository implements SalesDeliveryNoteDocumentSeriesIssuanceRepository {
  /**
   * @param client - Trusted server-only Supabase client authorized for the issuance RPC.
   * @returns A transaction-backed delivery-note issuance adapter.
   */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc SalesDeliveryNoteDocumentSeriesIssuanceRepository.issue} */
  async issue(command: IssueSalesDeliveryNoteWithDocumentSeriesCommand): Promise<IssuedSalesDeliveryNoteWithDocumentSeries> {
    try {
      const { data, error } = await this.client.rpc("confirm_native_sales_delivery_note_with_document_series_secure", {
        p_actor_user_id: command.actorUserId, p_organization_id: command.organizationId, p_company_id: command.companyId,
        p_invoice_id: command.deliveryNoteId, p_idempotency_key: command.idempotencyKey,
        p_scope_kind: command.documentSeriesScope.kind,
        p_scope_branch_id: command.documentSeriesScope.kind === "branch" ? command.documentSeriesScope.branchId : null,
        p_selection_kind: command.documentSeriesSelection.kind,
        p_series_id: command.documentSeriesSelection.kind === "explicit" ? command.documentSeriesSelection.seriesId : null,
        p_allow_negative_stock: command.allowNegativeStock, p_price_list_id: command.priceListId ?? null,
        p_branch_id: command.branchId ?? null, p_device_id: command.deviceId ?? null,
        p_company_branch_id: command.companyBranchId ?? null, p_sales_register_id: command.salesRegisterId ?? null,
      });
      if (error) throw rpcFailure(error.message);
      const parsed = issuance.safeParse(data);
      if (!parsed.success || parsed.data.deliveryNoteId !== command.deliveryNoteId || parsed.data.companyId !== command.companyId) throw unavailable(parsed.success ? undefined : parsed.error);
      return Object.freeze({ ...parsed.data, companyId: companyId(parsed.data.companyId) });
    } catch (cause) {
      if (cause instanceof SalesFailure) throw cause;
      throw unavailable(cause);
    }
  }
}

/**
 * Composes the delivery-note issuance service used by trusted server consumers.
 * @param client - Trusted server-only Supabase client.
 * @returns Portable delivery-note issuance application service.
 */
export function createSupabaseSalesDeliveryNoteDocumentSeriesIssuance(client: SupabaseClient): IssueSalesDeliveryNoteWithDocumentSeries {
  return new IssueSalesDeliveryNoteWithDocumentSeries(new SupabaseSalesDeliveryNoteDocumentSeriesIssuanceRepository(client));
}

function rpcFailure(message: string): SalesFailure {
  for (const code of [
    "SALES_DOCUMENT_SERIES_INVALID", "SALES_DOCUMENT_SERIES_SELECTION_INVALID", "SALES_DOCUMENT_SERIES_NOT_FOUND",
    "SALES_DOCUMENT_SERIES_EXHAUSTED", "SALES_DOCUMENT_SERIES_NUMBER_CONFLICT", "SALES_DOCUMENT_SERIES_IDEMPOTENCY_CONFLICT",
    "SALES_DOCUMENT_SERIES_RECONCILIATION_FAILED", "SALES_NOT_FOUND", "SALES_CREDIT_INVALID", "SALES_CONCURRENCY_CONFLICT",
    "SALES_ORDER_TRANSITION_INVALID", "SALES_BRANCH_INVALID", "SALES_BRANCH_NOT_FOUND", "SALES_BRANCH_ACCESS_DENIED",
  ] as const) if (message.includes(code)) return new SalesFailure(code, "Sales delivery-note issuance was rejected.");
  if (/ACCESS_DENIED|PERMISSION|FORBIDDEN|UNAUTHORIZED/.test(message)) return new SalesFailure("SALES_ACCESS_DENIED", "Sales delivery-note issuance is not authorized.");
  return unavailable();
}
function unavailable(cause?: unknown): SalesFailure {
  return new SalesFailure("SALES_REPOSITORY_UNAVAILABLE", "Sales delivery-note issuance persistence is unavailable or returned invalid data.", { cause });
}
