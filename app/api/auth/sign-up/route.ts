import { NextRequest } from "next/server";
import { getAuthActions } from "@/src/modules/auth/backend/infra/auth-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";

// POST /api/auth/sign-up
// Crea el usuario en Supabase Auth.
// El trigger on_auth_user_created aprovisiona el esquema tenant automáticamente.

export async function POST(req: NextRequest) {
    const { email, password } = await req.json();

    const result = await getAuthActions().signUp.execute({ email, pass: password });

    return handleResult(result, 201);
}
