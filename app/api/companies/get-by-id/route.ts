import { getCompanyActions } from "@/src/modules/companies/backend/infra/company-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

export const GET = withTenant(async (req, { schemaName }) => {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const { getById } = getCompanyActions(schemaName);
    const result = await getById.execute(id!);
    return handleResult(result);
});
