import { executePayablesQueryRequest } from "@/src/client-api/v1/payables/execute-payables-query-request";

type RouteContext = { params: Promise<{ organizationId: string; companyId: string }> };

/**
 * Reads one authorized Accounts Payable report for the route company.
 * @param request - Scope-free JSON report request with bearer authentication.
 * @param context - Dynamic organization and company route parameters.
 * @returns Typed API success or failure response.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const params = await context.params;
  return executePayablesQueryRequest(request, { organizationId: params.organizationId, companyId: params.companyId });
}
