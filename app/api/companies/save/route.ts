import { getCompanyActions } from "@/src/modules/companies/backend/infra/company-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

export const POST = withTenant(async (req, { userId, schemaName }) => {
    try {
        const body = await req.json();
        const { save } = getCompanyActions(schemaName);
        const result = await save.execute({ ...body, ownerId: userId });
        return handleResult(result, 201);
    } catch {
        return Response.json({ error: "Formato JSON inválido" }, { status: 400 });
    }
});
