import { getPayrollRunActions } from "@/src/modules/payroll/backend/infra/payroll-run-factory";
import { NextRequest }          from "next/server";

export async function POST(request: NextRequest) {
    try {
        const input = await request.json();

        if (!input?.run || !input?.receipts) {
            return Response.json({ error: "Payload inválido" }, { status: 400 });
        }

        const result = await getPayrollRunActions().confirm.execute(input);

        if (result.isFailure) {
            return Response.json({ error: result.getError() }, { status: 400 });
        }

        return Response.json({ data: { runId: result.getValue() } }, { status: 201 });
    } catch {
        return Response.json({ error: "Formato JSON inválido" }, { status: 400 });
    }
}
