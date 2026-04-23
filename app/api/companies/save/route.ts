import { getCompanyActions } from "@/src/modules/companies/backend/infrastructure/company-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

export const POST = withTenant(async (req, { userId, actingAs }) => {
    try {
        const body = await req.json();
        const ownerId = actingAs?.ownerId ?? userId;
        const result = await getCompanyActions(ownerId).save.execute({ ...body, ownerId });
        return handleResult(result, 201);
    } catch {
        return Response.json({ error: "Formato JSON inválido" }, { status: 400 });
    }
});
