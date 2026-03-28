import { getCompanyActions } from "@/src/modules/companies/backend/infrastructure/company-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

export const DELETE = withTenant(async (req, { userId }) => {
    const id = new URL(req.url).searchParams.get('id');
    const result = await getCompanyActions(userId).delete.execute(id!);
    return handleResult(result);
});
