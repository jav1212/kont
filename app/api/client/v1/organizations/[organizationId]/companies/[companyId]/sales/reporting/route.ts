import { executeSalesPerformanceReportRequest } from "@/src/client-api/v1/sales/execute-sales-performance-report-request";

export const dynamic = "force-dynamic";

/** Returns grouped sales performance for a validated organization and company context. */
export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string; companyId: string }> },
) {
  const params = await context.params;
  return executeSalesPerformanceReportRequest(request, params.organizationId, params.companyId);
}
