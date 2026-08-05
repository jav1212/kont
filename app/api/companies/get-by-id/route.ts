import { getCompanyActions } from "@/src/modules/companies/backend/infrastructure/company-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

export const GET = withTenant(async (req, { userId, actingAs, effectiveOwnerId, tenantId}) => {
    const id = new URL(req.url).searchParams.get('id');
    const ownerId = effectiveOwnerId;
    const result = await getCompanyActions(tenantId).getById.execute(id!);
    return handleResult(result);
});
