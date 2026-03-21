import { getEmployeeActions } from "@/src/modules/payroll/backend/infra/employee-factory";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

// GET /api/employees/salary-history?companyId=X&cedula=Y
export const GET = withTenant(async (req, { userId, actingAs }) => {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");
    const cedula    = searchParams.get("cedula");

    if (!companyId) return Response.json({ error: "companyId es requerido" }, { status: 400 });
    if (!cedula)    return Response.json({ error: "cedula es requerida" },    { status: 400 });

    const ownerId = actingAs?.ownerId ?? userId;
    const result = await getEmployeeActions(ownerId).repository.getSalaryHistory(companyId, cedula);
    if (result.isFailure) return Response.json({ error: result.getError() }, { status: 400 });
    return Response.json({ data: result.getValue() });
});
