import { executeTreasuryRequest } from "@/src/client-api/v1/treasury/execute-treasury-request";

type RouteContext = { params: Promise<{ organizationId: string; companyId: string }> };

/**
 * Reads one stable, authorized Treasury query snapshot for the route company.
 * @param request - JSON query request with bearer authentication.
 * @param context - Dynamic organization and company route parameters.
 * @returns Typed API success or failure response.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const params = await context.params;
  return executeTreasuryRequest(request, params.organizationId, params.companyId, "query");
}
