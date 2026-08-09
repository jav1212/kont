import { getCompanyActions } from "@/src/modules/companies/backend/infrastructure/company-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { withTenantPermission } from "@/src/shared/backend/utils/require-tenant";

export const DELETE = withTenantPermission("companies.delete", async (req, { effectiveOwnerId, tenantId}) => {
    const id = new URL(req.url).searchParams.get('id');
    const ownerId = effectiveOwnerId;
    const result = await getCompanyActions(tenantId).delete.execute(id!);
    return handleResult(result);
});
