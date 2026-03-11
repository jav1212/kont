import { getCompanyActions, handleCompanyResult } from "@/src/backend/companies/infra/company-factory";


export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    const { getById } = getCompanyActions();
    const result = await getById.execute(id!);
    return handleCompanyResult(result);
}