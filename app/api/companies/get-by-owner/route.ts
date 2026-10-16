import { getCompanyActions } from "@/src/modules/companies/backend/infrastructure/company-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

export const GET = withTenant(async (_req, { effectiveOwnerId, tenantId, security }) => {
    const ownerId = effectiveOwnerId;
    const result  = await getCompanyActions(tenantId).getByOwner.execute(ownerId);
    if (result.isFailure) return handleResult(result);
    const allowed = security?.allowedCompanyIds;
    return Response.json({ data: allowed == null ? result.getValue() : result.getValue().filter((company) => allowed.includes(company.id)) },
        { headers: { 'Cache-Control': 'private, no-store' } });
});
