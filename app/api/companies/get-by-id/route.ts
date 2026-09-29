import { getCompanyActions } from "@/src/modules/companies/backend/infrastructure/company-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

export const GET = withTenant(async (req, { tenantId, security }) => {
    const id = new URL(req.url).searchParams.get('id');
    if (!id || (security?.allowedCompanyIds != null && !security.allowedCompanyIds.includes(id))) {
        return Response.json({ error: 'Sin acceso a esta empresa' }, { status: 403 });
    }
    const result = await getCompanyActions(tenantId).getById.execute(id!);
    return handleResult(result);
});
