import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/src/shared/backend/utils/require-admin';

function serviceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

/**
 * PATCH /api/admin/tenants/[id]
 * Actualiza status y/o plan de un tenant.
 * Body: { status?, planId?, billingCycle? }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const adminCheck = await requireAdmin(req);
    if (adminCheck) return adminCheck;

    try {
        const { id } = await params;
        const body = await req.json();
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

        if (body.status)             update.status              = body.status;
        if (body.planId)             update.plan_id             = body.planId;
        if (body.billingCycle)       update.billing_cycle       = body.billingCycle;
        if (body.periodStart)        update.current_period_start = body.periodStart;
        if (body.periodEnd)          update.current_period_end   = body.periodEnd;

        if (Object.keys(update).length === 1) {
            return Response.json({ error: 'No hay campos para actualizar' }, { status: 400 });
        }

        const supabase = serviceClient();
        const { data, error } = await supabase
            .from('tenants')
            .update(update)
            .eq('id', id)
            .select()
            .single();

        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({ data });
    } catch {
        return Response.json({ error: 'Formato JSON inválido' }, { status: 400 });
    }
}
