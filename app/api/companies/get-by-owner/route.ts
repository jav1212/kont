import { getCompanyActions } from "@/src/modules/companies/backend/infra/company-factory";
import { handleResult as handleCompanyResult } from "@/src/shared/backend/utils/handle-result";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const ownerId = searchParams.get('ownerId');

    const { getByOwner } = getCompanyActions();
    const result = await getByOwner.execute(ownerId!);
    return handleCompanyResult(result);
}