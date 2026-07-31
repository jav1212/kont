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
import { PAYROLL_REFERENCE_CURRENCY_CODES } from '@/src/modules/payroll/shared/reference-currency';

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
    label:    z.string().min(1),
    amount:   z.string(),
    currency: z.enum([...PAYROLL_REFERENCE_CURRENCY_CODES, 'VES']).optional(),
    active: z.boolean().optional(),
});

const PdfVisibilitySchema = z.object({
    showEarnings:          z.boolean(),
    showDeductions:        z.boolean(),
    showBonuses:           z.boolean(),
    showOvertime:          z.boolean(),
    showAlicuotaBreakdown: z.boolean(),
});

const HorasExtrasGlobalDefSchema = z.object({
    tipo:   z.enum(['diurna', 'nocturna']),
    hours:  z.string(),
    active: z.boolean(),
});

const PayrollSettingsSchema = z.object({
    earningRowDefs:        z.array(EarningRowDefSchema),
    deductionRowDefs:      z.array(DeductionRowDefSchema),
    bonusRowDefs:          z.array(BonusRowDefSchema),
    diasUtilidades:        z.number().nonnegative(),
    diasBonoVacacional:    z.number().nonnegative(),
    salaryMode:            z.enum(['mensual', 'integral']),
    cestaTicketUSD:        z.number().nonnegative(),
    cestaTicketEnabled:    z.boolean().optional(),
    bonoGuerraUSD:         z.number().nonnegative(),
    bonoGuerraEnabled:     z.boolean().optional(),
    cestaTicketCurrency:   z.enum([...PAYROLL_REFERENCE_CURRENCY_CODES, 'VES']),
    bonoGuerraCurrency:    z.enum([...PAYROLL_REFERENCE_CURRENCY_CODES, 'VES']),
    salarioMinimoRef:      z.number().nonnegative(),
    horasExtrasGlobalRows: z.array(HorasExtrasGlobalDefSchema),
    pdfVisibility:         PdfVisibilitySchema,
    enabledPaymentModes:   z.array(z.enum(["diario", "hora"])).optional(),
});

const PutBodySchema = z.object({
    companyId: z.string().min(1),
    settings:  PayrollSettingsSchema,
});

export const GET = withTenant(async (req, { userId, actingAs, effectiveOwnerId}) => {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    if (!companyId) {
        return Response.json({ error: 'companyId requerido' }, { status: 400 });
    }

    // When acting on behalf of another tenant, use that tenant's userId for schema routing.
    const effectiveUserId = effectiveOwnerId;
    const result = await getPayrollSettingsActions(effectiveUserId).get.execute(companyId);
    return handleResult(result);
});

export const PUT = withTenant(async (req, { userId, actingAs, effectiveOwnerId}) => {
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

    const { companyId } = parsed.data;
    if (actingAs?.role === "contable") {
        return Response.json({ error: "Los contables invitados tienen acceso de lectura a esta configuracion." }, { status: 403 });
    }
    const settings = { ...parsed.data.settings, enabledPaymentModes: parsed.data.settings.enabledPaymentModes ?? ["diario"], cestaTicketEnabled: parsed.data.settings.cestaTicketEnabled ?? true, bonoGuerraEnabled: parsed.data.settings.bonoGuerraEnabled ?? true };
    const effectiveUserId = effectiveOwnerId;
    const result = await getPayrollSettingsActions(effectiveUserId).save.execute(companyId, settings);
    return handleResult(result);
});
