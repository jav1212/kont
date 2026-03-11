import { getUserActions, handleUserResult } from "@/src/backend/users/infra/user-factory";

export async function DELETE(req: Request) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    const { delete: deleteUser } = getUserActions();
    // Ejecuta DeleteUserUseCase
    const result = await deleteUser.execute(id!); 
    return handleUserResult(result);
}