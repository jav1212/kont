import { getCompanyActions } from "@/src/modules/companies/backend/infra/company-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

export const DELETE = withTenant(async (req, _tenant) => {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const { delete: deleteAction } = getCompanyActions();
    const result = await deleteAction.execute(id!);
    return handleResult(result);
});
