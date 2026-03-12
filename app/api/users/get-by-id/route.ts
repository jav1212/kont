import { getUserActions, handleUserResult } from "@/src/modules/users/backend/infra/user-factory";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return Response.json({ error: "ID is required" }, { status: 400 });

    const { getById } = getUserActions();
    // Ejecuta GetUserByIdUseCase
    const result = await getById.execute(id);
    return handleUserResult(result);
}