import { ProfileFailure } from "@kontave/profile-application";
import type { NativeCurrentUserDto } from "@kontave/native-api-contracts";
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
