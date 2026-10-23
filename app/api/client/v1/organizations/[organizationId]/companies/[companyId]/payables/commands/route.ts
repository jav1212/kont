import { executePayablesCommandRequest } from "@/src/client-api/v1/payables/execute-payables-command-request";

type RouteContext = { params: Promise<{ organizationId: string; companyId: string }> };

/**
 * Executes one authorized, idempotent Accounts Payable command for the route company.
 * @param request - Scope-free JSON command with bearer authentication.
 * @param context - Dynamic organization and company route parameters.
 * @returns Typed API success or failure response.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const params = await context.params;
  return executePayablesCommandRequest(request, { organizationId: params.organizationId, companyId: params.companyId });
}
