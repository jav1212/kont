import { getAuthActions } from "@/src/modules/auth/backend/infra/auth-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";

export async function POST() {
    const result = await getAuthActions().signOut.execute();
    return handleResult(result, 200);
}