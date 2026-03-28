import { getUserActions } from "@/src/modules/users/backend/infra/user-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";

export async function DELETE(req: Request) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    const { delete: deleteUser } = getUserActions();
    // Ejecuta DeleteUserUseCase
    const result = await deleteUser.execute(id!); 
    return handleResult(result);
}