// API route for unconfirming a bono socio-económico run — reverts it to 'draft'.
// No accounting integration is generated, so this is a pure state change.
import { getBonoGuerraRunActions } from "@/src/modules/payroll/backend/infrastructure/bono-guerra-run-factory";
import { withTenant }               from "@/src/shared/backend/utils/require-tenant";
import { handleResult }             from "@/src/shared/backend/utils/handle-result";

export const POST = withTenant(async (req, { effectiveOwnerId }) => {
    let body: { runId?: string };
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: "Formato JSON inválido." }, { status: 400 });
    }
    if (!body.runId) {
        return Response.json({ error: "runId es requerido." }, { status: 422 });
    }

    const result = await getBonoGuerraRunActions(effectiveOwnerId).unconfirm.execute({ runId: body.runId });
    return handleResult(result);
});
