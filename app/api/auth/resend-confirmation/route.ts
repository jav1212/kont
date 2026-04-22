// API route — POST /api/auth/resend-confirmation
// Reenvía el correo de confirmación de signup de Supabase cuando el OTP expiró.
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

    const result = await getAuthActions().resendConfirmation.execute({
        email,
        emailRedirectTo: `${origin}/api/auth/callback`,
    });

    return handleResult(result, 200);
}
