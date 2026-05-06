import { getUserActions } from "@/src/modules/users/backend/infrastructure/user-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { requireTenant, TenantAuthError } from "@/src/shared/backend/utils/require-tenant";

export async function GET(req: Request) {
    let userId: string;
    try {
        ({ userId } = await requireTenant(req));
    } catch (err) {
        if (err instanceof TenantAuthError) {
            return Response.json({ error: "No autenticado" }, { status: 401 });
        }
        throw err;
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return Response.json({ error: "ID is required" }, { status: 400 });

    if (id !== userId) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { getById } = getUserActions();
    const result = await getById.execute(id);
    return handleResult(result);
}
