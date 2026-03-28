import { getUserActions } from "@/src/modules/users/backend/infra/user-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";

export async function PATCH(req: Request) {
    try {
        const { id, data } = await req.json();
        const { update } = getUserActions();
        const result = await update.execute({ id, data });
        return handleResult(result);
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
}