// API route for unconfirming a payroll run — reverts it to 'draft' so it can be
// edited and re-confirmed. Interface adapter only; business logic lives in the use case.
// After a successful unconfirm, reverses the accounting entries generated on confirm
// (non-blocking) so payroll and accounting stay consistent. Mirrors the inventory
// purchase unconfirm flow (app/api/purchases/[id]/unconfirm/route.ts).
import { getPayrollRunActions } from "@/src/modules/payroll/backend/infrastructure/payroll-run-factory";
import { getAccountingActions } from "@/src/modules/accounting/backend/infrastructure/accounting-factory";
import { withTenant }           from "@/src/shared/backend/utils/require-tenant";
import { handleResult }         from "@/src/shared/backend/utils/handle-result";

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

    const ownerId = effectiveOwnerId;
    const result  = await getPayrollRunActions(ownerId).unconfirm.execute({ runId: body.runId });

    // Non-blocking: reverse the accounting integration that ran on confirmation.
    if (result.isSuccess) {
        const { companyId, id } = result.getValue();
        await getAccountingActions(ownerId).reversePayrollIntegration.execute({
            companyId,
            payrollRunId: id,
        });
    }

    return handleResult(result);
});
