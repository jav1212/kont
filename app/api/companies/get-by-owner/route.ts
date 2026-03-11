import { getCompanyActions, handleCompanyResult } from "@/src/backend/companies/infra/company-factory";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const ownerId = searchParams.get('ownerId');

    const { getByOwner } = getCompanyActions();
    const result = await getByOwner.execute(ownerId!);
    return handleCompanyResult(result);
}