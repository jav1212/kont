import { getAuthActions } from "@/src/modules/auth/backend/infrastructure/auth-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { rateLimit } from "@/src/shared/backend/utils/rate-limit";

export async function POST(req: Request) {
    const denied = await rateLimit(req, { bucket: "auth-sign-in", limit: 8, windowSec: 60 });
    if (denied) return denied;

    try {
        const { email, password } = await req.json();
        const result = await getAuthActions().signIn.execute({ email, password });
        return handleResult(result, 200);
    } catch {
        return Response.json({ error: "Invalid request format" }, { status: 400 });
    }
}