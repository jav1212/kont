// API route — POST /api/auth/forgot-password
// Delegates to ResetPasswordUseCase. Always returns success to avoid email enumeration.
import { getAuthActions } from "@/src/modules/auth/backend/infrastructure/auth-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { rateLimit } from "@/src/shared/backend/utils/rate-limit";

export async function POST(req: Request) {
    const denied = await rateLimit(req, { bucket: "auth-forgot", limit: 3, windowSec: 3600 });
    if (denied) return denied;

    let email: string;
    try {
        ({ email } = await req.json());
    } catch {
        return Response.json({ error: 'Formato JSON inválido.' }, { status: 400 });
    }

    const { origin } = new URL(req.url);

    const result = await getAuthActions().resetPassword.execute({
        email,
        redirectTo: `${origin}/reset-password`,
    });

    return handleResult(result, 200);
}
