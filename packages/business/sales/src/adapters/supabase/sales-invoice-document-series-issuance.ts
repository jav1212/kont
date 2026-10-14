import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { companyId } from "@kontave/companies/domain";
import { decodeFiscalDocument, encodeFiscalDocument } from "@kontave/fiscal/supabase";
import { decodeFact } from "@kontave/tax-reporting/supabase";
import type { TaxReportingFact } from "@kontave/tax-reporting/domain";
import type {
  IssuedSalesInvoiceWithDocumentSeries,
  IssueSalesInvoiceWithDocumentSeriesCommand,
  SalesInvoiceDocumentSeriesIssuanceRepository,
} from "../../application";
import { IssueSalesInvoiceWithDocumentSeries } from "../../application/issue-sales-invoice-with-document-series";
import { SalesFailure } from "../../domain";

const issuance = z.object({
  invoiceId: z.string().min(1),
  companyId: z.string().min(1),
  status: z.literal("confirmed"),
  seriesId: z.string().uuid(),
  displayNumber: z.string().min(1).max(128),
  number: z.number().int().positive().max(99_999_999),
  replayed: z.boolean(),
});
const atomicIssuance = z.object({
  issuance,
  fiscalDocument: z.unknown(),
  taxFact: z.unknown(),
  replayed: z.boolean(),
});

/** Supabase adapter for the single RPC that assigns a series number and confirms a draft. */
export class SupabaseSalesInvoiceDocumentSeriesIssuanceRepository
  implements SalesInvoiceDocumentSeriesIssuanceRepository {
  /**
   * @param client - Trusted server-only Supabase client authorized for the issuance RPC.
   * @returns A transaction-backed issuance adapter.
   */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc SalesInvoiceDocumentSeriesIssuanceRepository.issue} */
  async issue(
    command: IssueSalesInvoiceWithDocumentSeriesCommand,
    fact: TaxReportingFact,
  ): Promise<IssuedSalesInvoiceWithDocumentSeries> {
    try {
      const { data, error } = await this.client.rpc(
        "confirm_native_sales_invoice_tax_issuance_secure",
        {
          p_actor_user_id: command.actorUserId,
          p_organization_id: command.organizationId,
          p_company_id: command.companyId,
          p_invoice_id: command.invoiceId,
          p_idempotency_key: command.idempotencyKey,
          p_scope_kind: command.documentSeriesScope.kind,
          p_scope_branch_id: command.documentSeriesScope.kind === "branch"
            ? command.documentSeriesScope.branchId
            : null,
          p_selection_kind: command.documentSeriesSelection.kind,
          p_series_id: command.documentSeriesSelection.kind === "explicit"
            ? command.documentSeriesSelection.seriesId
            : null,
          p_allow_negative_stock: command.allowNegativeStock,
          p_price_list_id: command.priceListId ?? null,
          p_branch_id: command.branchId ?? null,
          p_device_id: command.deviceId ?? null,
          p_company_branch_id: command.companyBranchId ?? null,
          p_sales_register_id: command.salesRegisterId ?? null,
          p_tenant_id: command.taxScope.tenantId,
          p_source_updated_at: command.sourceUpdatedAt,
          p_fiscal_document_snapshot: JSON.parse(encodeFiscalDocument(command.fiscalDocumentDraft)),
          p_issue_date: command.fiscalIssueDate,
          p_issued_at: command.issuedAt,
          p_fact_snapshot: JSON.parse(encode(fact)),
        },
      );
      if (error) throw rpcFailure(error.message);
      const parsed = atomicIssuance.safeParse(data);
      if (!parsed.success || parsed.data.issuance.invoiceId !== command.invoiceId || parsed.data.issuance.companyId !== command.companyId) {
        throw unavailable(parsed.success ? undefined : parsed.error);
      }
      const fiscalDocument = decodeFiscalDocument(parsed.data.fiscalDocument);
      const taxFact = decodeFact(parsed.data.taxFact);
      if (fiscalDocument.id !== command.fiscalDocumentDraft.id || fiscalDocument.number !== parsed.data.issuance.displayNumber
        || fiscalDocument.status !== "issued" || taxFact.id !== fact.id || taxFact.direction !== "sale") throw unavailable();
      return Object.freeze({
        ...parsed.data.issuance,
        companyId: companyId(parsed.data.issuance.companyId),
        fiscalDocument,
        taxFact,
        replayed: parsed.data.replayed,
      });
    } catch (cause) {
      if (cause instanceof SalesFailure) throw cause;
      throw unavailable(cause);
    }
  }
}

/**
 * Composes the application service used by trusted server consumers of atomic series issuance.
 * @param client - Trusted server-only Supabase client.
 * @returns Portable sales issuance application service.
 */
export function createSupabaseSalesInvoiceDocumentSeriesIssuance(
  client: SupabaseClient,
): IssueSalesInvoiceWithDocumentSeries {
  return new IssueSalesInvoiceWithDocumentSeries(
    new SupabaseSalesInvoiceDocumentSeriesIssuanceRepository(client),
  );
}

function rpcFailure(message: string): SalesFailure {
  for (const code of [
    "SALES_DOCUMENT_SERIES_INVALID",
    "SALES_DOCUMENT_SERIES_SELECTION_INVALID",
    "SALES_DOCUMENT_SERIES_NOT_FOUND",
    "SALES_DOCUMENT_SERIES_EXHAUSTED",
    "SALES_DOCUMENT_SERIES_NUMBER_CONFLICT",
    "SALES_DOCUMENT_SERIES_IDEMPOTENCY_CONFLICT",
    "SALES_DOCUMENT_SERIES_RECONCILIATION_FAILED",
    "SALES_FISCAL_PREPARATION_INVALID",
    "SALES_FISCAL_TAX_UNRESOLVED",
    "SALES_NOT_FOUND",
    "SALES_CREDIT_INVALID",
    "SALES_CONCURRENCY_CONFLICT",
    "SALES_ORDER_TRANSITION_INVALID",
    "SALES_BRANCH_INVALID",
    "SALES_BRANCH_NOT_FOUND",
    "SALES_BRANCH_ACCESS_DENIED",
  ] as const) {
    if (message.includes(code)) return new SalesFailure(code, "Sales invoice issuance was rejected.");
  }
  if (/ACCESS_DENIED|PERMISSION|FORBIDDEN|UNAUTHORIZED/.test(message)) {
    return new SalesFailure("SALES_ACCESS_DENIED", "Sales invoice issuance is not authorized.");
  }
  return unavailable();
}

function encode(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) => typeof nested === "bigint" ? nested.toString() : nested);
}

function unavailable(cause?: unknown): SalesFailure {
  return new SalesFailure(
    "SALES_REPOSITORY_UNAVAILABLE",
    "Sales invoice issuance persistence is unavailable or returned invalid data.",
    { cause },
  );
}
