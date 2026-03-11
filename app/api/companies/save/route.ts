import { getCompanyActions, handleCompanyResult } from "@/src/backend/companies/infra/company-factory";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { save } = getCompanyActions();
        const result = await save.execute(body);
        return handleCompanyResult(result, 201);
    } catch {
        return Response.json({ error: "Formato JSON inválido" }, { status: 400 });
    }
}