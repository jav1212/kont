import { getCompanyActions } from "@/src/modules/companies/backend/infra/company-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

export const GET = withTenant(async (_req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const result  = await getCompanyActions(ownerId).getByOwner.execute(ownerId);
    return handleResult(result);
});
