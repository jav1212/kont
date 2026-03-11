import { getAuthActions, handleResult } from "@/src/backend/auth/infra/auth-factory";

export async function GET() {
    const result = await getAuthActions().me.execute();
    return handleResult(result, 200);
}