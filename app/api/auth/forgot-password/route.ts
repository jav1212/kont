// API route — POST /api/auth/forgot-password
//
// Dispara el envío del correo de recuperación. Supabase incluye en el correo
// tanto el magic-link como el código de 6 dígitos ({{ .Token }}); el frontend
// usa el código vía supabase.auth.verifyOtp({ type: 'recovery' }), por lo que
// ya no pasamos `redirectTo` — el link queda como fallback inactivo.
//
// Siempre retornamos éxito para evitar email enumeration.
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

    const result = await getAuthActions().resetPassword.execute({ email });

    return handleResult(result, 200);
}
