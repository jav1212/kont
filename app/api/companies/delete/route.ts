import { getCompanyActions } from "@/src/modules/companies/backend/infrastructure/company-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

export const DELETE = withTenant(async (req, { userId, actingAs, effectiveOwnerId}) => {
    const id = new URL(req.url).searchParams.get('id');
    const ownerId = effectiveOwnerId;
    const result = await getCompanyActions(ownerId).delete.execute(id!);
    return handleResult(result);
});
