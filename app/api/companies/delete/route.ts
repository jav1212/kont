import { getCompanyActions, handleCompanyResult } from "@/src/backend/companies/infra/company-factory";

export async function DELETE(req: Request) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    const { delete: deleteAction } = getCompanyActions();
    const result = await deleteAction.execute(id!);
    return handleCompanyResult(result);
}