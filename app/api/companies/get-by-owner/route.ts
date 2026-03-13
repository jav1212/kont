import { getCompanyActions } from "@/src/modules/companies/backend/infra/company-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

export const GET = withTenant(async (_req, { userId, schemaName }) => {
    const { getByOwner } = getCompanyActions(schemaName);
    const result = await getByOwner.execute(userId);
    return handleResult(result);
});
