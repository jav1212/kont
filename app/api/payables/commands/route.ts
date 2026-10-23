import { executePayablesCommandRequest } from "@/src/client-api/v1/payables/execute-payables-command-request";

/** Handles one authorized, idempotent Accounts Payable write command.
 * @param request - Authenticated JSON command envelope.
 * @returns A no-store command receipt or typed error response.
 * @throws Never; the request boundary translates expected failures.
 */
export async function POST(request: Request): Promise<Response> {
  return executePayablesCommandRequest(request);
}
