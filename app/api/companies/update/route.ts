import { getCompanyActions } from "@/src/modules/companies/backend/infrastructure/company-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

export const PATCH = withTenant(async (req, { userId, actingAs }) => {
    try {
        const { id, name, rif, phone, address, contactEmail, logoUrl, showLogoInPdf, sector, taxpayerType } = await req.json();
        const ownerId = actingAs?.ownerId ?? userId;
        const result = await getCompanyActions(ownerId).update.execute({ id, data: { name, rif, phone, address, contactEmail, logoUrl, showLogoInPdf, sector, taxpayerType } });
        return handleResult(result);
    } catch {
        return Response.json({ error: "Formato JSON inválido" }, { status: 400 });
    }
});
