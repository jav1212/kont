import { getUserActions } from "@/src/modules/users/backend/infrastructure/user-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { requireAdmin } from "@/src/shared/backend/utils/require-admin";

export async function GET(req: Request) {
    const denied = await requireAdmin(req);
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email) return Response.json({ error: "Email is required" }, { status: 400 });

    const { getByEmail } = getUserActions();
    const result = await getByEmail.execute(email);
    return handleResult(result);
}
