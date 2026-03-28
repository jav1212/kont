// app/api/payroll/settings/route.ts
//
// Payroll settings API — GET/PUT per company.
//   GET ?companyId=... → returns PayrollSettings (or defaults if none saved)
//   PUT { companyId, settings } → persists PayrollSettings for that company
//
// Tenant isolation is enforced by withTenant().
// Payload validation is enforced by Zod before delegating to the use case (REQ-008).

import { z }                         from 'zod';
import { getPayrollSettingsActions } from '@/src/modules/payroll/backend/infrastructure/payroll-settings-factory';
import { handleResult }              from '@/src/shared/backend/utils/handle-result';
import { withTenant }                from '@/src/shared/backend/utils/require-tenant';

// ── Zod validation schema ─────────────────────────────────────────────────────

const EarningRowDefSchema = z.object({
    label:      z.string().min(1),
    multiplier: z.string(),
    useDaily:   z.boolean(),
    quantity:   z.string().optional(),
});

const DeductionRowDefSchema = z.object({
    label:        z.string().min(1),
    rate:         z.string(),
    base:         z.enum(['weekly', 'monthly', 'integral', 'weekly-capped']),
    mode:         z.enum(['rate', 'fixed']),
    quincenaRule: z.enum(['always', 'second-half']),
});

const BonusRowDefSchema = z.object({
    label:  z.string().min(1),
    amount: z.string(),
});

const PdfVisibilitySchema = z.object({
    showEarnings:          z.boolean(),
    showDeductions:        z.boolean(),
    showBonuses:           z.boolean(),
    showOvertime:          z.boolean(),
    showNightShiftBonus:   z.boolean(),
    showAlicuotaBreakdown: z.boolean(),
});

const OvertimeDefaultsSchema = z.object({
    dayOvertimeEnabled:   z.boolean(),
    nightOvertimeEnabled: z.boolean(),
});

const PayrollSettingsSchema = z.object({
    earningRowDefs:      z.array(EarningRowDefSchema),
    deductionRowDefs:    z.array(DeductionRowDefSchema),
    bonusRowDefs:        z.array(BonusRowDefSchema),
    diasUtilidades:      z.number().nonnegative(),
    diasBonoVacacional:  z.number().nonnegative(),
    salaryMode:          z.enum(['mensual', 'integral']),
    cestaTicketUSD:      z.number().nonnegative(),
    bonoNocturnoEnabled: z.boolean(),
    salarioMinimoRef:    z.number().nonnegative(),
    overtimeDefaults:    OvertimeDefaultsSchema,
    pdfVisibility:       PdfVisibilitySchema,
});

const PutBodySchema = z.object({
    companyId: z.string().min(1),
    settings:  PayrollSettingsSchema,
});

export const GET = withTenant(async (req, { userId, actingAs }) => {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    if (!companyId) {
        return Response.json({ error: 'companyId requerido' }, { status: 400 });
    }

    // When acting on behalf of another tenant, use that tenant's userId for schema routing.
    const effectiveUserId = actingAs?.ownerId ?? userId;
    const result = await getPayrollSettingsActions(effectiveUserId).get.execute(companyId);
    return handleResult(result);
});

export const PUT = withTenant(async (req, { userId, actingAs }) => {
    let rawBody: unknown;
    try {
        rawBody = await req.json();
    } catch {
        return Response.json({ error: 'Formato JSON inválido' }, { status: 400 });
    }

    const parsed = PutBodySchema.safeParse(rawBody);
    if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? 'Payload inválido';
        return Response.json({ error: message }, { status: 400 });
    }

    const { companyId, settings } = parsed.data;
    const effectiveUserId = actingAs?.ownerId ?? userId;
    const result = await getPayrollSettingsActions(effectiveUserId).save.execute(companyId, settings);
    return handleResult(result);
});
