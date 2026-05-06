import { getUserActions } from "@/src/modules/users/backend/infrastructure/user-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { requireAdmin } from "@/src/shared/backend/utils/require-admin";

export async function GET(req: Request) {
    const denied = await requireAdmin(req);
    if (denied) return denied;

    const { getAll } = getUserActions();
    const result = await getAll.execute();
    return handleResult(result);
}
