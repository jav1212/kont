import { getCompanyActions } from "@/src/modules/companies/backend/infrastructure/company-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { TenantForbiddenError, requireTenantRole, withTenantPermissions } from "@/src/shared/backend/utils/require-tenant";

export const POST = withTenantPermissions(["companies.create", "companies.update"], async (req, { effectiveOwnerId, tenantId, role}) => {
    try {
        const body = await req.json();
        if (body.operatingProfile !== undefined && body.operatingProfile !== 'standard' && body.operatingProfile !== 'kiosk') {
            return Response.json({ error: 'operatingProfile invalido' }, { status: 400 });
        }
        if (body.operatingProfile !== undefined) requireTenantRole({ role }, 'owner', 'admin');
        const ownerId = effectiveOwnerId;
        const result = await getCompanyActions(tenantId).save.execute({ ...body, ownerId });
        return handleResult(result, 201);
    } catch (cause) {
        if (cause instanceof TenantForbiddenError) throw cause;
        return Response.json({ error: "Formato JSON inválido" }, { status: 400 });
    }
});
