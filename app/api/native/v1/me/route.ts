import { ProfileFailure } from "@kontave/profile-application";
import type { NativeCurrentUserDto } from "@kontave/native-api-contracts";
import type { NativeUpdateCurrentUserDto } from "@kontave/native-api-contracts";
import { authenticateNativeRequest, readBearerToken } from "@/src/native-api/v1/auth/native-auth-context";
import { nativeError, nativeSuccess } from "@/src/native-api/v1/http/native-response";
import { createNativeProfileActions } from "@/src/native-api/v1/profile/native-profile-actions";
import { toNativeCurrentUserDto } from "@/src/native-api/v1/profile/native-profile-mapper";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const accessToken = readBearerToken(request.headers.get("authorization"));
    const identity = accessToken ? await authenticateNativeRequest(request) : null;
    if (!accessToken || !identity) {
      return nativeError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);
    }

    const currentProfile = await createNativeProfileActions(accessToken)
      .getCurrentProfile.execute(identity);
    const response: NativeCurrentUserDto = toNativeCurrentUserDto(currentProfile);
    return nativeSuccess(response, requestId);
  } catch (cause: unknown) {
    console.error("native.profile.current.failed", { requestId, cause });
    if (cause instanceof ProfileFailure && cause.code === "PROFILE_REPOSITORY_UNAVAILABLE") {
      return nativeError("PROFILE_REPOSITORY_UNAVAILABLE", "No se pudo consultar el perfil.", requestId, 503);
    }
    return nativeError("INTERNAL_ERROR", "No se pudo obtener el perfil.", requestId, 500);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const accessToken = readBearerToken(request.headers.get("authorization"));
    const identity = accessToken ? await authenticateNativeRequest(request) : null;
    if (!accessToken || !identity) return nativeError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);
    const body = await request.json() as NativeUpdateCurrentUserDto;
    if (!Number.isSafeInteger(body.expectedVersion)) return nativeError("INVALID_REQUEST", "expectedVersion es requerido.", requestId, 400);
    const details = await createNativeProfileActions(accessToken).updateCurrentProfile.execute({ userId: identity.userId, displayName: body.displayName, expectedVersion: body.expectedVersion });
    return nativeSuccess({ userId: identity.userId, email: identity.email, ...details }, requestId);
  } catch (cause: unknown) { return profileError(cause, requestId); }
}

function profileError(cause: unknown, requestId: string): Response {
  if (cause instanceof ProfileFailure) {
    const status = cause.code === "PROFILE_VERSION_CONFLICT" ? 409 : cause.code.includes("INVALID") ? 400 : 503;
    return nativeError(cause.code, cause.message, requestId, status);
  }
  console.error("native.profile.update.failed", { requestId, cause });
  return nativeError("INTERNAL_ERROR", "No se pudo actualizar el perfil.", requestId, 500);
}
