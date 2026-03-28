import { getUserActions } from "@/src/modules/users/backend/infrastructure/user-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";

export async function DELETE(req: Request) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    const { delete: deleteUser } = getUserActions();
    // Executes DeleteUserUseCase
    const result = await deleteUser.execute(id!); 
    return handleResult(result);
}