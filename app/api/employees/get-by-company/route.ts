// app/api/employees/get-by-company/route.ts

import { getEmployeeActions } from "@/src/backend/employees/infra/employee-factory";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
    const companyId = request.nextUrl.searchParams.get("companyId");
    if (!companyId) {
        return Response.json({ error: "companyId es requerido" }, { status: 400 });
    }

    const result = await getEmployeeActions().getByCompany.execute({ companyId });

    if (result.isFailure) {
        return Response.json({ error: result.getError() }, { status: 400 });
    }

    return Response.json({ data: result.getValue() }, { status: 200 });
}