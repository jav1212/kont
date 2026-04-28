import { getCestaTicketRunActions } from "@/src/modules/payroll/backend/infrastructure/cesta-ticket-run-factory";
import { withTenant }                from "@/src/shared/backend/utils/require-tenant";

export const GET = withTenant(async (req, { userId, actingAs }) => {
    const runId = new URL(req.url).searchParams.get("runId");
    if (!runId) return Response.json({ error: "runId es requerido" }, { status: 400 });

    const ownerId = actingAs?.ownerId ?? userId;
    const result = await getCestaTicketRunActions(ownerId).getReceipts.execute(runId);
    if (result.isFailure) return Response.json({ error: result.getError() }, { status: 400 });
    return Response.json({ data: result.getValue() }, { status: 200 });
});
