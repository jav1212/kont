import { GetSalesPerformanceReport } from "@kontave/sales/application";
import { createSupabaseSalesPerformanceReportReader } from "@kontave/sales/supabase";

/** Creates the sales performance report application service and its Supabase adapter. */
export function createSalesPerformanceReportActions() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Native sales reporting infrastructure is not configured.");
  return {
    get: new GetSalesPerformanceReport(
      createSupabaseSalesPerformanceReportReader({ url, serviceRoleKey }),
    ),
  };
}
