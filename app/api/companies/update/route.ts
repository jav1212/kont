import { getCompanyActions } from "@/src/modules/companies/backend/infrastructure/company-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

export const PATCH = withTenant(async (req, { userId }) => {
    try {
        const { id, name, rif, phone, address, logoUrl, showLogoInPdf } = await req.json();
        const result = await getCompanyActions(userId).update.execute({ id, data: { name, rif, phone, address, logoUrl, showLogoInPdf } });
        return handleResult(result);
    } catch {
        return Response.json({ error: "Formato JSON inválido" }, { status: 400 });
    }
});
