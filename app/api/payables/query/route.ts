import { executePayablesQueryRequest } from "@/src/client-api/v1/payables/execute-payables-query-request";

/** Handles an authorized payables report query for one company.
 * @param request - Authenticated JSON query request.
 * @returns No-store API response with a report page or typed failure.
 * @throws Never; application failures are translated by the request boundary.
 */
export async function POST(request: Request): Promise<Response> {
  return executePayablesQueryRequest(request);
}
