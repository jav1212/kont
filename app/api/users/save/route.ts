import { getUserActions, handleUserResult } from "@/src/backend/users/infra/user-factory";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { save } = getUserActions();
        const result = await save.execute(body);
        return handleUserResult(result, 201);
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
}