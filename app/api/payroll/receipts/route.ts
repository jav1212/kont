import { getPayrollRunActions } from "@/src/modules/payroll/backend/infra/payroll-run-factory";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

export const GET = withTenant(async (req, { schemaName }) => {
    const runId = new URL(req.url).searchParams.get("runId");

    if (!runId) {
        return Response.json({ error: "runId es requerido" }, { status: 400 });
    }

    const result = await getPayrollRunActions(schemaName).getReceipts.execute(runId);

    if (result.isFailure) {
        return Response.json({ error: result.getError() }, { status: 400 });
    }

    return Response.json({ data: result.getValue() }, { status: 200 });
});
