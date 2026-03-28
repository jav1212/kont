import { getUserActions } from "@/src/modules/users/backend/infra/user-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";

export async function GET() {
    const { getAll } = getUserActions();
    const result = await getAll.execute();
    return handleResult(result);
}