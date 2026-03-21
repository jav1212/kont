import { getEmployeeActions } from "@/src/modules/payroll/backend/infra/employee-factory";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

export const POST = withTenant(async (req, { userId, actingAs }) => {
    try {
        const { companyId, employees } = await req.json();
        if (!companyId) return Response.json({ error: "companyId es requerido" }, { status: 400 });
        if (!Array.isArray(employees) || employees.length === 0)
            return Response.json({ error: "La lista de empleados está vacía" }, { status: 400 });

        const withCompany = employees.map((e: any) => ({ ...e, companyId }));
        const ownerId = actingAs?.ownerId ?? userId;
        const result = await getEmployeeActions(ownerId).upsertEmployees.execute({ employees: withCompany });
        if (result.isFailure) return Response.json({ error: result.getError() }, { status: 400 });
        return Response.json({ data: null }, { status: 200 });
    } catch {
        return Response.json({ error: "Formato JSON inválido" }, { status: 400 });
    }
});
