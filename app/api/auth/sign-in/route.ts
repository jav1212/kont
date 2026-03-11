import { getAuthActions, handleResult } from "@/src/backend/auth/infra/auth-factory";

export async function POST(req: Request) {
    try {
        const { email, pass } = await req.json();
        const result = await getAuthActions().signIn.execute({ email, pass });
        return handleResult(result, 200);
    } catch {
        return Response.json({ error: "Invalid request format" }, { status: 400 });
    }
}