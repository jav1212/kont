import { z } from "zod";
import { getPayrollRunActions }  from "@/src/modules/payroll/backend/infrastructure/payroll-run-factory";
import { getAccountingActions }  from "@/src/modules/accounting/backend/infrastructure/accounting-factory";
import { withTenant }            from "@/src/shared/backend/utils/require-tenant";

const CalculationDataSchema = z.object({
    gross:          z.number(),
    netUsd:         z.number(),
    mondaysInMonth: z.number().int().nonnegative(),
});

const ReceiptSchema = z.object({
    companyId:        z.string().min(1),
    employeeId:       z.string().min(1),
    employeeCedula:   z.string().min(1),
    employeeNombre:   z.string().min(1),
    employeeCargo:    z.string().default(""),
    monthlySalary:    z.number().positive("El salario debe ser mayor a 0"),
    totalEarnings:    z.number().nonnegative(),
    totalDeductions:  z.number().nonnegative(),
    totalBonuses:     z.number().nonnegative(),
    netPay:           z.number(),
    calculationData:  CalculationDataSchema,
});

const ConfirmSchema = z.object({
    run: z.object({
        companyId:    z.string().min(1),
        periodStart:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
        periodEnd:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
        exchangeRate: z.number().positive("La tasa BCV debe ser mayor a 0"),
    }),
    receipts: z.array(ReceiptSchema).min(1, "Se requiere al menos un empleado"),
});

export const POST = withTenant(async (req, { userId, actingAs }) => {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: "Formato JSON inválido." }, { status: 400 });
    }

    const parsed = ConfirmSchema.safeParse(body);
    if (!parsed.success) {
        const first = parsed.error.issues[0];
        return Response.json({ error: first?.message ?? "Datos inválidos." }, { status: 422 });
    }

    const ownerId = actingAs?.ownerId ?? userId;
    const result = await getPayrollRunActions(ownerId).confirm.execute(parsed.data);
    if (result.isFailure) return Response.json({ error: result.getError() }, { status: 400 });

    const runId = result.getValue();

    // Non-blocking: trigger accounting integration after successful confirm.
    // Errors are absorbed and logged in accounting_integration_log — they do not fail this response.
    const { run, receipts } = parsed.data;
    const totalEarnings   = receipts.reduce((s, r) => s + r.totalEarnings,   0);
    const totalDeductions = receipts.reduce((s, r) => s + r.totalDeductions, 0);
    const netPay          = receipts.reduce((s, r) => s + r.netPay,          0);

    await getAccountingActions(ownerId).processPayrollIntegration.execute({
        companyId:       run.companyId,
        payrollRunId:    runId,
        periodEnd:       run.periodEnd,
        totalEarnings,
        totalDeductions,
        netPay,
    });

    return Response.json({ data: { runId } }, { status: 201 });
});
