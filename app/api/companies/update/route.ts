import { getCompanyActions } from "@/src/modules/companies/backend/infrastructure/company-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { TenantForbiddenError, requireTenantRole, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";

export const PATCH = withTenantPermission("companies.update", async (req, { effectiveOwnerId, tenantId, role}) => {
    try {
        const { id, name, rif, phone, address, contactEmail, logoUrl, showLogoInPdf, sector, taxpayerType, operatingProfile } = await req.json();
        if (operatingProfile !== undefined && operatingProfile !== 'standard' && operatingProfile !== 'kiosk') {
            return Response.json({ error: 'operatingProfile invalido' }, { status: 400 });
        }
        if (operatingProfile !== undefined) requireTenantRole({ role }, 'owner', 'admin');
        const ownerId = effectiveOwnerId;
        const result = await getCompanyActions(tenantId).update.execute({ id, data: { name, rif, phone, address, contactEmail, logoUrl, showLogoInPdf, sector, taxpayerType, operatingProfile } });
        return handleResult(result);
    } catch (cause) {
        if (cause instanceof TenantForbiddenError) throw cause;
        return Response.json({ error: "Formato JSON inválido" }, { status: 400 });
    }
});
