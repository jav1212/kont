import { organizationId, userId } from "@kontave/organizations/domain";
import { authenticateClientRequest } from "@/src/client-api/v1/auth/auth-context";
import { apiError, apiSuccess } from "@/src/client-api/v1/http/response";
import { createOrganizationActions } from "@/src/client-api/v1/organizations/organization-actions";
import { organizationErrorResponse } from "@/src/client-api/v1/organizations/organization-http";
import { toOrganizationDto } from "@/src/client-api/v1/organizations/organization-mapper";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const identity = await authenticateClientRequest(request);
    if (!identity)
      return apiError(
        "INVALID_ACCESS_TOKEN",
        "La sesión no es válida o expiró.",
        requestId,
        401,
      );
    const params = await context.params;
    const access = await createOrganizationActions().getOrganization.execute(
      userId(identity.userId),
      organizationId(params.organizationId),
    );
    return apiSuccess(toOrganizationDto(access), requestId);
  } catch (cause: unknown) {
    return organizationErrorResponse(cause, requestId);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const identity = await authenticateClientRequest(request);
    if (!identity)
      return apiError(
        "INVALID_ACCESS_TOKEN",
        "La sesión no es válida o expiró.",
        requestId,
        401,
      );
    const params = await context.params;
    const body = (await request.json()) as {
      name?: string;
      expectedVersion?: number;
    };
    if (!Number.isSafeInteger(body.expectedVersion))
      return apiError(
        "INVALID_REQUEST",
        "expectedVersion es requerido.",
        requestId,
        400,
      );
    const organization =
      await createOrganizationActions().updateOrganization.execute({
        actorUserId: userId(identity.userId),
        organizationId: organizationId(params.organizationId),
        name: body.name,
        expectedVersion: body.expectedVersion!,
      });
    const access = await createOrganizationActions().getOrganization.execute(
      userId(identity.userId),
      organization.id,
    );
    return apiSuccess(
      toOrganizationDto({ ...access, organization }),
      requestId,
    );
  } catch (cause: unknown) {
    return organizationErrorResponse(cause, requestId);
  }
}
