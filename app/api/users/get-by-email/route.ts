import { getUserActions } from "@/src/modules/users/backend/infra/user-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email) return Response.json({ error: "Email is required" }, { status: 400 });

    const { getByEmail } = getUserActions();
    // Ejecuta GetUserByEmailUseCase (valida formato '@')
    const result = await getByEmail.execute(email);
    return handleResult(result);
}