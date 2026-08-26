import { ProfileFailure } from "@kontave/profile/application";
import {
  authenticateClientRequest,
  readBearerToken,
} from "@/src/client-api/v1/auth/auth-context";
import { apiError, apiSuccess } from "@/src/client-api/v1/http/response";
import { createProfileActions } from "@/src/client-api/v1/profile/profile-actions";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return execute(request, async (actions, userId) => {
    const form = await request.formData();
    const avatar = form.get("avatar");
    const expectedVersion = Number(form.get("expectedVersion"));
    if (!(avatar instanceof File) || !Number.isSafeInteger(expectedVersion))
      throw new ProfileFailure(
        "PROFILE_AVATAR_INVALID",
        "avatar y expectedVersion son requeridos.",
      );
    return actions.uploadAvatar.execute({
      userId,
      expectedVersion,
      avatar: {
        bytes: new Uint8Array(await avatar.arrayBuffer()),
        contentType: avatar.type,
      },
    });
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return execute(request, async (actions, userId) => {
    const body = (await request.json()) as { expectedVersion?: number };
    if (!Number.isSafeInteger(body.expectedVersion))
      throw new ProfileFailure(
        "PROFILE_DATA_INVALID",
        "expectedVersion es requerido.",
      );
    return actions.deleteAvatar.execute({
      userId,
      expectedVersion: body.expectedVersion!,
    });
  });
}

async function execute(
  request: Request,
  operation: (
    actions: ReturnType<typeof createProfileActions>,
    userId: string,
  ) => Promise<unknown>,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const token = readBearerToken(request.headers.get("authorization"));
    const identity = token ? await authenticateClientRequest(request) : null;
    if (!token || !identity)
      return apiError(
        "INVALID_ACCESS_TOKEN",
        "La sesión no es válida o expiró.",
        requestId,
        401,
      );
    return apiSuccess(
      await operation(createProfileActions(token), identity.userId),
      requestId,
    );
  } catch (cause: unknown) {
    if (cause instanceof ProfileFailure)
      return apiError(
        cause.code,
        cause.message,
        requestId,
        cause.code === "PROFILE_VERSION_CONFLICT"
          ? 409
          : cause.code.includes("INVALID")
            ? 400
            : 503,
      );
    console.error("client.profile.avatar.failed", { requestId, cause });
    return apiError(
      "INTERNAL_ERROR",
      "No se pudo procesar el avatar.",
      requestId,
      500,
    );
  }
}
