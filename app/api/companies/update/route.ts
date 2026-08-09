import { getCompanyActions } from "@/src/modules/companies/backend/infrastructure/company-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { withTenantPermission } from "@/src/shared/backend/utils/require-tenant";

export const PATCH = withTenantPermission("companies.update", async (req, { effectiveOwnerId, tenantId}) => {
    try {
        const { id, name, rif, phone, address, contactEmail, logoUrl, showLogoInPdf, sector, taxpayerType } = await req.json();
        const ownerId = effectiveOwnerId;
        const result = await getCompanyActions(tenantId).update.execute({ id, data: { name, rif, phone, address, contactEmail, logoUrl, showLogoInPdf, sector, taxpayerType } });
        return handleResult(result);
    } catch {
        return Response.json({ error: "Formato JSON inválido" }, { status: 400 });
    }
});
