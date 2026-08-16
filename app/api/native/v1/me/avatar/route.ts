import { ProfileFailure } from "@kontave/profile-application";
import { authenticateNativeRequest, readBearerToken } from "@/src/native-api/v1/auth/native-auth-context";
import { nativeError, nativeSuccess } from "@/src/native-api/v1/http/native-response";
import { createNativeProfileActions } from "@/src/native-api/v1/profile/native-profile-actions";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return execute(request, async (actions, userId) => {
    const form = await request.formData();
    const avatar = form.get("avatar");
    const expectedVersion = Number(form.get("expectedVersion"));
    if (!(avatar instanceof File) || !Number.isSafeInteger(expectedVersion)) throw new ProfileFailure("PROFILE_AVATAR_INVALID", "avatar y expectedVersion son requeridos.");
    return actions.uploadAvatar.execute({ userId, expectedVersion, avatar: { bytes: new Uint8Array(await avatar.arrayBuffer()), contentType: avatar.type } });
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return execute(request, async (actions, userId) => {
    const body = await request.json() as { expectedVersion?: number };
    if (!Number.isSafeInteger(body.expectedVersion)) throw new ProfileFailure("PROFILE_DATA_INVALID", "expectedVersion es requerido.");
    return actions.deleteAvatar.execute({ userId, expectedVersion: body.expectedVersion! });
  });
}

async function execute(request: Request, operation: (actions: ReturnType<typeof createNativeProfileActions>, userId: string) => Promise<unknown>): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const token = readBearerToken(request.headers.get("authorization"));
    const identity = token ? await authenticateNativeRequest(request) : null;
    if (!token || !identity) return nativeError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);
    return nativeSuccess(await operation(createNativeProfileActions(token), identity.userId), requestId);
  } catch (cause: unknown) {
    if (cause instanceof ProfileFailure) return nativeError(cause.code, cause.message, requestId, cause.code === "PROFILE_VERSION_CONFLICT" ? 409 : cause.code.includes("INVALID") ? 400 : 503);
    console.error("native.profile.avatar.failed", { requestId, cause });
    return nativeError("INTERNAL_ERROR", "No se pudo procesar el avatar.", requestId, 500);
  }
}
