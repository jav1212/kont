import { getPayrollRunActions } from "@/src/modules/payroll/backend/infra/payroll-run-factory";
import { NextRequest }          from "next/server";

export async function GET(request: NextRequest) {
    const companyId = request.nextUrl.searchParams.get("companyId");

    if (!companyId) {
        return Response.json({ error: "companyId es requerido" }, { status: 400 });
    }

    const result = await getPayrollRunActions().getRuns.execute(companyId);

    if (result.isFailure) {
        return Response.json({ error: result.getError() }, { status: 400 });
    }

    return Response.json({ data: result.getValue() }, { status: 200 });
}
