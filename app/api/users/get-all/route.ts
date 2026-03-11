import { getUserActions, handleUserResult } from "@/src/backend/users/infra/user-factory";

export async function GET() {
    const { getAll } = getUserActions();
    const result = await getAll.execute();
    return handleUserResult(result);
}