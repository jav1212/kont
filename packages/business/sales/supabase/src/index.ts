import {
  SalesDashboardFailure,
  type SalesDashboardQuery,
  type SalesDashboardReader,
  type SalesDashboardSnapshot,
} from "@kontave/sales-application";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.object({ amount: z.string(), currency: z.literal("VES") });
const document = z.object({
  id: z.string(),
  sourceKind: z.literal("legacy_sales_invoice"),
  documentType: z.literal("invoice"),
  invoiceNumber: z.string(),
  customerName: z.string().nullable(),
  date,
  status: z.enum(["confirmed", "draft"]),
  salesChannel: z.enum(["administrative", "pos"]),
  subtotal: money,
  taxableBase: money,
  vatAmount: money,
  total: money,
  transactionCurrency: z.string(),
  sourceSubtotal: z.string().nullable(),
  sourceVatAmount: z.string().nullable(),
  sourceTotal: z.string().nullable(),
});
const snapshot = z.object({
  period: z.object({ from: date, to: date, granularity: z.literal("day") }),
  summary: z.object({
    confirmedInvoicedAmount: money,
    taxableBaseAmount: money,
    vatDebitAmount: money,
    confirmedInvoiceCount: z.number().int().nonnegative(),
    draftInvoiceCount: z.number().int().nonnegative(),
    averageTicketAmount: money,
  }),
  charts: z.array(
    z.object({
      date,
      confirmedInvoicedAmount: money,
      taxableBaseAmount: money,
      vatDebitAmount: money,
      confirmedInvoiceCount: z.number().int().nonnegative(),
    }),
  ),
  recentConfirmedInvoices: z.array(document),
  recentDraftInvoices: z.array(document),
  generatedAt: z.string().min(1),
});

/** Connection details required by the sales dashboard adapter. */
export interface SupabaseSalesDashboardConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/** Legacy shared-table knowledge is confined to this compatibility adapter. */
export class SupabaseSalesDashboardReader implements SalesDashboardReader {
  /**
   * Creates a dashboard reader backed by a Supabase client.
   * @param client Client authorized to execute the native dashboard RPC.
   */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc SalesDashboardReader.read} */
  async read(query: SalesDashboardQuery): Promise<SalesDashboardSnapshot> {
    const { data, error } = await this.client.rpc("get_native_sales_dashboard_snapshot", {
      p_actor_user_id: query.actorUserId,
      p_organization_id: query.organizationId,
      p_company_id: query.companyId,
      p_from: query.from,
      p_to: query.to,
      p_granularity: query.granularity,
      p_recent_limit: query.recentLimit,
    });
    if (error) throw mapRpcFailure(error);

    const parsed = snapshot.safeParse(data);
    if (!parsed.success) {
      throw new SalesDashboardFailure(
        "SALES_DASHBOARD_UNAVAILABLE",
        "Sales dashboard returned invalid data.",
        { cause: parsed.error },
      );
    }
    if (
      parsed.data.recentConfirmedInvoices.length > query.recentLimit ||
      parsed.data.recentDraftInvoices.length > query.recentLimit
    ) {
      throw new SalesDashboardFailure(
        "SALES_DASHBOARD_UNAVAILABLE",
        "Sales dashboard exceeded the requested recent-document limit.",
      );
    }
    return parsed.data;
  }
}

/**
 * Creates the production sales dashboard reader.
 * @param configuration Supabase endpoint and service-role credential.
 * @returns A reader that validates every RPC response.
 */
export function createSupabaseSalesDashboardReader(
  configuration: SupabaseSalesDashboardConfiguration,
): SalesDashboardReader {
  return new SupabaseSalesDashboardReader(
    createClient(configuration.url, configuration.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }),
  );
}

function mapRpcFailure(error: { readonly message: string }): SalesDashboardFailure {
  if (error.message.includes("SALES_DASHBOARD_ACCESS_DENIED")) {
    return new SalesDashboardFailure(
      "SALES_DASHBOARD_ACCESS_DENIED",
      "Sales dashboard access was denied.",
    );
  }
  if (error.message.includes("SALES_DASHBOARD_INVALID")) {
    return new SalesDashboardFailure(
      "SALES_DASHBOARD_INVALID",
      "Sales dashboard query is invalid.",
    );
  }
  return new SalesDashboardFailure("SALES_DASHBOARD_UNAVAILABLE", "Sales dashboard is unavailable.", {
    cause: error,
  });
}
