import { getCestaTicketRunActions } from "@/src/modules/payroll/backend/infrastructure/cesta-ticket-run-factory";
import { withTenant }                from "@/src/shared/backend/utils/require-tenant";

export const GET = withTenant(async (req, { userId, actingAs }) => {
    const companyId = new URL(req.url).searchParams.get("companyId");
    if (!companyId) return Response.json({ error: "companyId es requerido" }, { status: 400 });

    const ownerId = actingAs?.ownerId ?? userId;
    const result = await getCestaTicketRunActions(ownerId).getRuns.execute(companyId);
    if (result.isFailure) return Response.json({ error: result.getError() }, { status: 400 });
    return Response.json({ data: result.getValue() }, { status: 200 });
});
