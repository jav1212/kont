import { getUserActions } from "@/src/modules/users/backend/infrastructure/user-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { requireTenant, TenantAuthError } from "@/src/shared/backend/utils/require-tenant";
import type { User } from "@/src/modules/users/backend/domain/user";

export async function PATCH(req: Request) {
    let userId: string;
    try {
        ({ userId } = await requireTenant(req));
    } catch (err) {
        if (err instanceof TenantAuthError) {
            return Response.json({ error: "No autenticado" }, { status: 401 });
        }
        throw err;
    }

    let id: string;
    let data: Partial<User>;
    try {
        ({ id, data } = await req.json());
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!id) return Response.json({ error: "ID is required" }, { status: 400 });

    if (id !== userId) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { update } = getUserActions();
    const result = await update.execute({ id, data });
    return handleResult(result);
}
