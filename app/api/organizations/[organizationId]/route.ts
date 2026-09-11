import { executeWebOrganizationRequest } from "@/src/modules/organizations/backend/web-organization-actions";
import { parseOrganizationInput } from "@/src/modules/organizations/backend/web-organization-http";
import { organizationUpdateSchema } from "@/src/modules/organizations/contracts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ organizationId: string }> };

/**
 * Reads an organization in the selected, authorized Web tenant.
 * @param request Cookie-authenticated request with the selected tenant header.
 * @param context Organization route parameters.
 * @returns The workspace projection or a safe HTTP error.
 * @throws No expected domain errors.
 */
export async function GET(request: Request, context: Context): Promise<Response> {
  return executeWebOrganizationRequest(request, async (actions) => actions.workspace((await context.params).organizationId));
}

/**
 * Renames an organization using optimistic concurrency in the existing use case.
 * @param request JSON name and expectedVersion with authentication cookies.
 * @param context Organization route parameters.
 * @returns The updated workspace; stale versions return HTTP 409.
 * @throws No expected domain errors.
 */
export async function PATCH(request: Request, context: Context): Promise<Response> {
  return executeWebOrganizationRequest(request, async (actions) => {
    const input = parseOrganizationInput(organizationUpdateSchema, await request.json());
    return actions.update((await context.params).organizationId, input);
  });
}

