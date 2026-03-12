import { getUserActions, handleUserResult } from "@/src/modules/users/backend/infra/user-factory";

export async function GET() {
    const { getAll } = getUserActions();
    const result = await getAll.execute();
    return handleUserResult(result);
}