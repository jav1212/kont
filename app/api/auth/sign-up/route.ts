import { NextRequest } from "next/server";
import { getAuthActions } from "@/src/modules/auth/backend/infra/auth-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { getUserActions } from "@/src/modules/users/backend/infra/user-factory";

// POST /api/auth/sign-up

export async function POST(req: NextRequest) {
    const { email, password, name } = await req.json();

    // ── 1. Crear en Auth ──────────────────────────────────────────────────
    const authResult = await getAuthActions().signUp.execute({ email, pass: password });
    if (authResult.isFailure) return handleResult(authResult, 201);

    const auth = authResult.getValue(); // { id, email }

    // ── 2. Persistir en DB ────────────────────────────────────────────────
    const now = new Date();
    const saveResult = await getUserActions().save.execute({
        id:        auth.id,
        email:     auth.email,
        name:      name ?? null,
        createdAt: now,
        updatedAt: now,
    });
    if (saveResult.isFailure) return handleResult(saveResult, 201);

    return handleResult(authResult, 201);
}