import { getCompanyActions } from "@/src/modules/companies/backend/infra/company-factory";
import { handleResult as handleCompanyResult } from "@/src/shared/backend/utils/handle-result";

export async function DELETE(req: Request) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    const { delete: deleteAction } = getCompanyActions();
    const result = await deleteAction.execute(id!);
    return handleCompanyResult(result);
}