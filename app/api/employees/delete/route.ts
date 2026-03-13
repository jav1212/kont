import { getEmployeeActions } from "@/src/modules/payroll/backend/infra/employee-factory";
import { NextRequest }        from "next/server";

export async function DELETE(request: NextRequest) {
    try {
        const { ids } = await request.json();

        if (!Array.isArray(ids) || ids.length === 0) {
            return Response.json({ error: "ids es requerido" }, { status: 400 });
        }

        const result = await getEmployeeActions().deleteEmployees.execute(ids);

        if (result.isFailure) {
            return Response.json({ error: result.getError() }, { status: 400 });
        }

        return Response.json({ data: null }, { status: 200 });
    } catch {
        return Response.json({ error: "Formato JSON inválido" }, { status: 400 });
    }
}
