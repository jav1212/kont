import { getEmployeeActions } from "@/src/modules/payroll/backend/infra/employee-factory";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

export const GET = withTenant(async (req, { userId, actingAs }) => {
    const companyId = new URL(req.url).searchParams.get("companyId");
    if (!companyId) return Response.json({ error: "companyId es requerido" }, { status: 400 });

    const ownerId = actingAs?.ownerId ?? userId;
    const result = await getEmployeeActions(ownerId).getByCompany.execute({ companyId });
    if (result.isFailure) return Response.json({ error: result.getError() }, { status: 400 });
    return Response.json({ data: result.getValue() }, { status: 200 });
});
