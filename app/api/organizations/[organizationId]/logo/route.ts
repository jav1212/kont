import { executeWebOrganizationRequest } from "@/src/modules/organizations/backend/web-organization-actions";
import { parseOrganizationInput, WebOrganizationInputError } from "@/src/modules/organizations/backend/web-organization-http";
import { organizationVersionSchema } from "@/src/modules/organizations/contracts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ organizationId: string }> };

/**
 * Stores organization branding through the shared, versioned logo use case.
 * @param request Multipart file and decimal expectedVersion from an authenticated session.
 * @param context Organization route parameters.
 * @returns The updated workspace or a validation, authorization, or version error.
 * @throws No expected domain errors; oversized files are rejected before buffering.
 */
export async function POST(request: Request, context: Context): Promise<Response> {
  return executeWebOrganizationRequest(request, async (actions) => {
    const form = await request.formData();
    const file = form.get("file");
    const version = form.get("expectedVersion");
    if (!(file instanceof File) || file.size === 0 || file.size > 5_000_000
      || !["image/png", "image/jpeg", "image/webp"].includes(file.type)
      || typeof version !== "string" || !/^[1-9][0-9]*$/.test(version)) {
      throw new WebOrganizationInputError("Logo o versión inválidos.");
    }
    const input = parseOrganizationInput(organizationVersionSchema, { expectedVersion: Number(version) });
    return actions.uploadLogo((await context.params).organizationId, file, input.expectedVersion);
  });
}

/**
 * Removes organization branding with the caller's expected version.
 * @param request JSON expectedVersion from an authenticated session.
 * @param context Organization route parameters.
 * @returns Updated branding or a safe HTTP error, including 409 for concurrent changes.
 * @throws No expected domain errors.
 */
export async function DELETE(request: Request, context: Context): Promise<Response> {
  return executeWebOrganizationRequest(request, async (actions) => {
    const input = parseOrganizationInput(organizationVersionSchema, await request.json());
    return actions.deleteLogo((await context.params).organizationId, input.expectedVersion);
  });
}

