import { PreferencesFailure } from "@kontave/preferences-domain";
import type { UpdateUserPreferencesDto } from "@kontave/client-contracts";
import { userId } from "@kontave/organizations/domain";
import {
  authenticateClientRequest,
  readBearerToken,
} from "@/src/client-api/v1/auth/auth-context";
import { apiError, apiSuccess } from "@/src/client-api/v1/http/response";
import { createPreferencesActions } from "@/src/client-api/v1/preferences/preferences-actions";
import { toUserPreferencesDto } from "@/src/client-api/v1/preferences/preferences-mapper";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return execute(request);
}
export async function PATCH(request: Request): Promise<Response> {
  let body: UpdateUserPreferencesDto;
  try {
    body = (await request.json()) as UpdateUserPreferencesDto;
  } catch {
    return apiError(
      "INVALID_REQUEST",
      "La solicitud no es válida.",
      crypto.randomUUID(),
      400,
    );
  }
  return execute(request, body);
}

async function execute(
  request: Request,
  update?: UpdateUserPreferencesDto,
): Promise<Response> {
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
    const actions = createPreferencesActions(accessToken);
    const value = update
      ? await actions.update.execute({
          userId: userId(identity.userId),
          expectedVersion: update.expectedVersion,
          appearance: update.appearance,
          regional: update.regional,
        })
      : await actions.get.execute(userId(identity.userId));
    return apiSuccess(toUserPreferencesDto(value), requestId);
  } catch (cause: unknown) {
    if (cause instanceof PreferencesFailure) {
      const status =
        cause.code === "PREFERENCES_VERSION_CONFLICT"
          ? 409
          : cause.code === "PREFERENCES_INVALID"
            ? 400
            : 503;
      return apiError(cause.code, cause.message, requestId, status);
    }
    console.error("client.preferences.failed", { requestId, cause });
    return apiError(
      "INTERNAL_ERROR",
      "No se pudieron procesar las preferencias.",
      requestId,
      500,
    );
  }
}
