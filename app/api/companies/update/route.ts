import { getCompanyActions } from "@/src/modules/companies/backend/infra/company-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

export const PATCH = withTenant(async (req, { schemaName }) => {
    try {
        const { id, name } = await req.json();
        const { update } = getCompanyActions(schemaName);
        const result = await update.execute({ id, data: { name } });
        return handleResult(result);
    } catch {
        return Response.json({ error: "Formato JSON inválido" }, { status: 400 });
    }
});
