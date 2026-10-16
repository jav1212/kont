import { executeTreasuryRequest } from "@/src/client-api/v1/treasury/execute-treasury-request";

type RouteContext = { params: Promise<{ organizationId: string; companyId: string }> };

/**
 * Executes one authorized, idempotent Treasury command for the route company.
 * @param request - JSON command request with bearer authentication.
 * @param context - Dynamic organization and company route parameters.
 * @returns Typed API success or failure response.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const params = await context.params;
  return executeTreasuryRequest(request, params.organizationId, params.companyId, "commands");
}
