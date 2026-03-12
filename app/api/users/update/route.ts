import { getUserActions, handleUserResult } from "@/src/modules/users/backend/infra/user-factory";

export async function PATCH(req: Request) {
    try {
        const { id, data } = await req.json();
        const { update } = getUserActions();
        const result = await update.execute({ id, data });
        return handleUserResult(result);
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
}