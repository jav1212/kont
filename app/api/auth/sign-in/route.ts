import { getAuthActions, handleResult } from "@/src/backend/auth/infra/auth-factory";

export async function POST(req: Request) {
    try {
        const { email, password } = await req.json();
        const result = await getAuthActions().signIn.execute({ email, password });
        return handleResult(result, 200);
    } catch {
        return Response.json({ error: "Invalid request format" }, { status: 400 });
    }
}