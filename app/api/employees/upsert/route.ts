// app/api/employees/upsert/route.ts

import { getEmployeeActions } from "@/src/modules/payroll/backend/infra/employee-factory";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const { companyId, employees } = await request.json();

        if (!companyId) {
            return Response.json({ error: "companyId es requerido" }, { status: 400 });
        }
        if (!Array.isArray(employees) || employees.length === 0) {
            return Response.json({ error: "La lista de empleados está vacía" }, { status: 400 });
        }

        // Inject companyId into each employee
        const withCompany = employees.map((e: any) => ({ ...e, companyId }));

        const result = await getEmployeeActions().upsertEmployees.execute({ employees: withCompany });

        if (result.isFailure) {
            return Response.json({ error: result.getError() }, { status: 400 });
        }

        return Response.json({ data: null }, { status: 200 });
    } catch {
        return Response.json({ error: "Formato JSON inválido" }, { status: 400 });
    }
}