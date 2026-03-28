import { getAuthActions } from "@/src/modules/auth/backend/infrastructure/auth-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";

export async function POST(req: Request) {
    try {
        const { email, password } = await req.json();
        const result = await getAuthActions().signIn.execute({ email, password });
        return handleResult(result, 200);
    } catch {
        return Response.json({ error: "Invalid request format" }, { status: 400 });
    }
}