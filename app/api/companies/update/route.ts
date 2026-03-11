import { getCompanyActions, handleCompanyResult } from "@/src/backend/companies/infra/company-factory";

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