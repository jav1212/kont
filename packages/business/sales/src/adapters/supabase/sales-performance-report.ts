import {
  SalesPerformanceReportFailure,
  type SalesPerformanceReport,
  type SalesPerformanceReportQuery,
  type SalesPerformanceReportReader,
} from "../../application";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const response = z.object({
  period: z.object({ from: z.string(), to: z.string() }),
  dimension: z.enum(["user", "role", "device"]),
  currency: z.literal("VES"),
  rows: z.array(z.object({
    key: z.string(),
    label: z.string(),
    attributed: z.boolean(),
    invoiceCount: z.number().int().nonnegative(),
    grossAmount: z.object({ amount: z.string(), currency: z.literal("VES") }),
  })),
  generatedAt: z.string(),
});

/** Configuration required by the sales performance report adapter. */
export interface SupabaseSalesPerformanceReportConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/** Supabase adapter for the tenant-scoped sales performance report RPC. */
export class SupabaseSalesPerformanceReportReader implements SalesPerformanceReportReader {
  /**
   * Creates the report reader.
   * @param client Service authorized to call the reporting RPC.
   */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc SalesPerformanceReportReader.read} */
  async read(query: SalesPerformanceReportQuery): Promise<SalesPerformanceReport> {
    const { data, error } = await this.client.rpc("get_native_sales_performance_report", {
      p_actor_user_id: query.actorUserId,
      p_organization_id: query.organizationId,
      p_company_id: query.companyId,
      p_from: query.from,
      p_to: query.to,
      p_dimension: query.dimension,
      p_currency: query.currency,
    });
    if (error) {
      if (error.message.includes("SALES_REPORT_ACCESS_DENIED")) {
        throw new SalesPerformanceReportFailure("SALES_REPORT_ACCESS_DENIED", "Sales report access was denied.");
      }
      if (error.message.includes("SALES_REPORT_INVALID")) {
        throw new SalesPerformanceReportFailure("SALES_REPORT_INVALID", "Sales report query is invalid.");
      }
      throw new SalesPerformanceReportFailure("SALES_REPORT_UNAVAILABLE", "Sales report is unavailable.", { cause: error });
    }
    const parsed = response.safeParse(data);
    if (!parsed.success) {
      throw new SalesPerformanceReportFailure("SALES_REPORT_UNAVAILABLE", "Sales report returned invalid data.", { cause: parsed.error });
    }
    return parsed.data;
  }
}

/**
 * Creates a service-role reader for the authorized reporting RPC.
 * @param configuration Supabase endpoint and service-role credential.
 * @returns A report reader that validates every RPC response.
 */
export function createSupabaseSalesPerformanceReportReader(
  configuration: SupabaseSalesPerformanceReportConfiguration,
): SalesPerformanceReportReader {
  return new SupabaseSalesPerformanceReportReader(createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
}
