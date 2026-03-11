import { getAuthActions, handleResult } from "@/src/backend/auth/infra/auth-factory";

export async function POST() {
    const result = await getAuthActions().signOut.execute();
    return handleResult(result, 200);
}