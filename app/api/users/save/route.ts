import { getUserActions } from "@/src/modules/users/backend/infrastructure/user-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { save } = getUserActions();
        const result = await save.execute(body);
        return handleResult(result, 201);
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
}