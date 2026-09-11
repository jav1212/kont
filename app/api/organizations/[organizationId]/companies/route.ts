import { executeWebOrganizationRequest } from "@/src/modules/organizations/backend/web-organization-actions";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ organizationId: string }> };

/**
 * Reads the organization's companies using scoped organization permissions.
 * @param request Cookie-authenticated request with the selected tenant header.
 * @param context Organization route parameters.
 * @returns An uncached companies projection or a safe authorization error.
 * @throws No expected domain errors.
 */
export async function GET(request: Request, context: Context): Promise<Response> {
  return executeWebOrganizationRequest(request, async (actions) => actions.companies((await context.params).organizationId));
}

