import { z } from "zod";
import { getBonificacionesRunActions } from "@/src/modules/payroll/backend/infrastructure/bonificaciones-run-factory";
import { withTenant }                  from "@/src/shared/backend/utils/require-tenant";

const BonusLineSchema = z.object({
    label:     z.string().min(1, "El concepto del bono es requerido"),
    currency:  z.enum(["USD", "VES"]),
    amount:    z.number().nonnegative(),
    amountVes: z.number().nonnegative(),
});

const ReceiptSchema = z.object({
    companyId:       z.string().min(1),
    employeeId:      z.string().min(1),
    employeeCedula:  z.string().min(1),
    employeeNombre:  z.string().min(1),
    employeeCargo:   z.string().default(""),
    totalVes:        z.number().nonnegative(),
    bonusLines:      z.array(BonusLineSchema).min(1, "Cada empleado debe tener al menos una línea de bono"),
});

const ConfirmSchema = z.object({
    run: z.object({
        companyId:     z.string().min(1),
        periodStart:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
        periodEnd:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
        exchangeRate:  z.number().positive("La tasa BCV debe ser mayor a 0"),
        totalVes:      z.number().nonnegative(),
        employeeCount: z.number().int().nonnegative(),
        lineCount:     z.number().int().nonnegative(),
    }),
    receipts: z.array(ReceiptSchema).min(1, "Se requiere al menos un empleado"),
});

export const POST = withTenant(async (req, { userId, actingAs, effectiveOwnerId }) => {
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

    const ownerId = effectiveOwnerId;
    const result = await getBonificacionesRunActions(ownerId).confirm.execute(parsed.data);
    if (result.isFailure) return Response.json({ error: result.getError() }, { status: 400 });

    return Response.json({ data: { runId: result.getValue() } }, { status: 201 });
});
