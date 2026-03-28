import { NextRequest } from "next/server";
import { getAuthActions } from "@/src/modules/auth/backend/infrastructure/auth-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";

// POST /api/auth/sign-up
// Crea el usuario en Supabase Auth.
// El trigger on_auth_user_created aprovisiona el esquema tenant automáticamente.

export async function POST(req: NextRequest) {
    const { email, password } = await req.json();
    const { origin } = new URL(req.url);

    const result = await getAuthActions().signUp.execute({
        email,
        pass: password,
        emailRedirectTo: `${origin}/api/auth/callback`,
    });

    return handleResult(result, 201);
}
