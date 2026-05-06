import { getUserActions } from "@/src/modules/users/backend/infrastructure/user-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { requireAdmin } from "@/src/shared/backend/utils/require-admin";

export async function DELETE(req: Request) {
    const denied = await requireAdmin(req);
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return Response.json({ error: "ID is required" }, { status: 400 });

    const { delete: deleteUser } = getUserActions();
    const result = await deleteUser.execute(id);
    return handleResult(result);
}
