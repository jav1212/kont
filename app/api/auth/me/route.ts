import { getAuthActions } from "@/src/modules/auth/backend/infrastructure/auth-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";

export async function GET() {
    const result = await getAuthActions().me.execute();
    return handleResult(result, 200);
}