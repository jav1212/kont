// API route — POST /api/auth/forgot-password
// Delegates to ResetPasswordUseCase. Always returns success to avoid email enumeration.
import { getAuthActions } from "@/src/modules/auth/backend/infrastructure/auth-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";

export async function POST(req: Request) {
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
