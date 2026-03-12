import { getCompanyActions } from "@/src/modules/companies/backend/infra/company-factory";
import { handleResult as handleCompanyResult } from "@/src/shared/backend/utils/handle-result";

export async function PATCH(req: Request) {
    try {
        const body = await req.json();
        const { update } = getCompanyActions();
        const result = await update.execute(body);
        return handleCompanyResult(result);
    } catch {
        return Response.json({ error: "Formato JSON inválido" }, { status: 400 });
    }
}