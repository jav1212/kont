import { executeWebOrganizationRequest } from "@/src/modules/organizations/backend/web-organization-actions";

export const dynamic = "force-dynamic";

/**
 * Lists organizations available to the authenticated Web and terminal session.
 * @param request Cookie-authenticated incoming request.
 * @returns An uncached workspace list or authentication error.
 * @throws No expected errors; the shared boundary maps them to HTTP responses.
 */
export async function GET(request: Request): Promise<Response> {
  return executeWebOrganizationRequest(request, (actions) => actions.list());
}

