import { executeAccountingRequest } from "@/src/client-api/v1/accounting/execute-accounting-request";

type RouteContext = { params: Promise<{ organizationId: string; companyId: string }> };

/** Executes one authenticated accounting query for the route company.
 * @param request - JSON query payload and bearer authentication.
 * @param context - Dynamic organization and company route values.
 * @returns Typed client API response.
 * @throws Never; expected failures are returned as HTTP responses.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const params = await context.params;
  return executeAccountingRequest(request, params.organizationId, params.companyId, "query");
}
