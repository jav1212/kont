import { getEmployeeActions } from "@/src/modules/payroll/backend/infrastructure/employee-factory";
import { withTenant } from "@/src/shared/backend/utils/require-tenant";

export const POST = withTenant(async (req, { userId, actingAs }) => {
    try {
        const { companyId, oldCedula, newCedula } = await req.json();
        if (!companyId)           return Response.json({ error: "companyId es requerido" },           { status: 400 });
        if (!oldCedula || !newCedula) return Response.json({ error: "oldCedula y newCedula son requeridos" }, { status: 400 });

        const ownerId = actingAs?.ownerId ?? userId;
        const result  = await getEmployeeActions(ownerId).renameEmployeeCedula.execute({
            companyId, oldCedula, newCedula,
        });
        if (result.isFailure) return Response.json({ error: result.getError() }, { status: 400 });
        return Response.json({ data: null }, { status: 200 });
    } catch {
        return Response.json({ error: "Formato JSON inválido" }, { status: 400 });
    }
});
