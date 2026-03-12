import { getCompanyActions } from "@/src/modules/companies/backend/infra/company-factory";
import { handleResult as handleCompanyResult } from "@/src/shared/backend/utils/handle-result";


export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    const { getById } = getCompanyActions();
    const result = await getById.execute(id!);
    return handleCompanyResult(result);
}