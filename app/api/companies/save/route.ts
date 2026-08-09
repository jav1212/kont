import { getCompanyActions } from "@/src/modules/companies/backend/infrastructure/company-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { withTenantPermission } from "@/src/shared/backend/utils/require-tenant";

export const POST = withTenantPermission("companies.create", async (req, { effectiveOwnerId, tenantId}) => {
    try {
        const body = await req.json();
        const ownerId = effectiveOwnerId;
        const result = await getCompanyActions(tenantId).save.execute({ ...body, ownerId });
        return handleResult(result, 201);
    } catch {
        return Response.json({ error: "Formato JSON inválido" }, { status: 400 });
    }
});
