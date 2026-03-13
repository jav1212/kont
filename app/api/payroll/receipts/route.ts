import { getPayrollRunActions } from "@/src/modules/payroll/backend/infra/payroll-run-factory";
import { NextRequest }          from "next/server";

export async function GET(request: NextRequest) {
    const runId = request.nextUrl.searchParams.get("runId");

    if (!runId) {
        return Response.json({ error: "runId es requerido" }, { status: 400 });
    }

    const result = await getPayrollRunActions().getReceipts.execute(runId);

    if (result.isFailure) {
        return Response.json({ error: result.getError() }, { status: 400 });
    }

    return Response.json({ data: result.getValue() }, { status: 200 });
}
