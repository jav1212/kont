import { ProfileFailure } from "@kontave/profile-application";
import type { CurrentUserDto } from "@kontave/client-contracts";
import type { UpdateCurrentUserDto } from "@kontave/client-contracts";
import {
  authenticateClientRequest,
  readBearerToken,
} from "@/src/client-api/v1/auth/auth-context";
import { apiError, apiSuccess } from "@/src/client-api/v1/http/response";
import { createProfileActions } from "@/src/client-api/v1/profile/profile-actions";
import { toCurrentUserDto } from "@/src/client-api/v1/profile/profile-mapper";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const accessToken = readBearerToken(request.headers.get("authorization"));
    const identity = accessToken
      ? await authenticateClientRequest(request)
      : null;
    if (!accessToken || !identity) {
      return apiError(
        "INVALID_ACCESS_TOKEN",
        "La sesión no es válida o expiró.",
        requestId,
        401,
      );
    }

    const currentProfile =
      await createProfileActions(accessToken).getCurrentProfile.execute(
        identity,
      );
    const response: CurrentUserDto = toCurrentUserDto(currentProfile);
    return apiSuccess(response, requestId);
  } catch (cause: unknown) {
    console.error("client.profile.current.failed", { requestId, cause });
    if (
      cause instanceof ProfileFailure &&
      cause.code === "PROFILE_REPOSITORY_UNAVAILABLE"
    ) {
      return apiError(
        "PROFILE_REPOSITORY_UNAVAILABLE",
        "No se pudo consultar el perfil.",
        requestId,
        503,
      );
    }
    return apiError(
      "INTERNAL_ERROR",
      "No se pudo obtener el perfil.",
      requestId,
      500,
    );
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const accessToken = readBearerToken(request.headers.get("authorization"));
    const identity = accessToken
      ? await authenticateClientRequest(request)
      : null;
    if (!accessToken || !identity)
      return apiError(
        "INVALID_ACCESS_TOKEN",
        "La sesión no es válida o expiró.",
        requestId,
        401,
      );
    const body = (await request.json()) as UpdateCurrentUserDto;
    if (!Number.isSafeInteger(body.expectedVersion))
      return apiError(
        "INVALID_REQUEST",
        "expectedVersion es requerido.",
        requestId,
        400,
      );
    const details = await createProfileActions(
      accessToken,
    ).updateCurrentProfile.execute({
      userId: identity.userId,
      displayName: body.displayName,
      expectedVersion: body.expectedVersion,
    });
    return apiSuccess(
      { userId: identity.userId, email: identity.email, ...details },
      requestId,
    );
  } catch (cause: unknown) {
    return profileError(cause, requestId);
  }
}

function profileError(cause: unknown, requestId: string): Response {
  if (cause instanceof ProfileFailure) {
    const status =
      cause.code === "PROFILE_VERSION_CONFLICT"
        ? 409
        : cause.code.includes("INVALID")
          ? 400
          : 503;
    return apiError(cause.code, cause.message, requestId, status);
  }
  console.error("client.profile.update.failed", { requestId, cause });
  return apiError(
    "INTERNAL_ERROR",
    "No se pudo actualizar el perfil.",
    requestId,
    500,
  );
}
