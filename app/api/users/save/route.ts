import { getUserActions } from "@/src/modules/users/backend/infrastructure/user-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { requireAdmin } from "@/src/shared/backend/utils/require-admin";

export async function POST(req: Request) {
    const denied = await requireAdmin(req);
    if (denied) return denied;

    try {
        const body = await req.json();
        const { save } = getUserActions();
        const result = await save.execute(body);
        return handleResult(result, 201);
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
}
