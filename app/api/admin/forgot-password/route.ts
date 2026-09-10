import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/admin/forgot-password
 * Sends a recovery email whose numeric code is verified in the administrator recovery page.
 * @param req - Unauthenticated request containing the account email.
 * @returns A delivery acknowledgement or a validation/provider error response.
 * The redirect remains available for older email templates containing a link.
 */
export async function POST(req: Request) {
    let email: string;
    try {
        ({ email } = await req.json());
    } catch {
        return Response.json({ error: 'Formato JSON inválido.' }, { status: 400 });
    }

    if (!email?.trim()) {
        return Response.json({ error: 'El correo es requerido.' }, { status: 400 });
    }

    const { origin } = new URL(req.url);

    // Usamos el cliente anon para poder llamar resetPasswordForEmail
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin}/admin/reset-password`,
    });

    if (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }

    // Siempre responde con éxito para no revelar si el correo existe
    return Response.json({ data: { ok: true } });
}
