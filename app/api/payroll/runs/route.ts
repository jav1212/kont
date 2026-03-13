import { getPayrollRunActions } from "@/src/modules/payroll/backend/infra/payroll-run-factory";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

export const GET = withTenant(async (req, { schemaName }) => {
    const companyId = new URL(req.url).searchParams.get("companyId");

    if (!companyId) {
        return Response.json({ error: "companyId es requerido" }, { status: 400 });
    }

    const result = await getPayrollRunActions(schemaName).getRuns.execute(companyId);

    if (result.isFailure) {
        return Response.json({ error: result.getError() }, { status: 400 });
    }

    return Response.json({ data: result.getValue() }, { status: 200 });
});
