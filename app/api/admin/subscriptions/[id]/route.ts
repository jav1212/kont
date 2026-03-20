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
 * PATCH /api/admin/subscriptions/[id]
 * Updates a tenant subscription.
 * Body: { status?, planId?, billingCycle?, periodStart?, periodEnd? }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const adminCheck = await requireAdmin(req);
    if (adminCheck) return adminCheck;

    try {
        const { id } = await params;
        const body = await req.json();

        const update: Record<string, unknown> = {};
        if (body.status)       update.status               = body.status;
        if (body.planId)       update.plan_id              = body.planId;
        if (body.billingCycle) update.billing_cycle        = body.billingCycle;
        if (body.periodStart)  update.current_period_start = body.periodStart;
        if (body.periodEnd)    update.current_period_end   = body.periodEnd;

        if (Object.keys(update).length === 0) {
            return Response.json({ error: 'No hay campos para actualizar' }, { status: 400 });
        }

        const supabase = serviceClient();
        const { data, error } = await supabase
            .from('tenant_subscriptions')
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

/**
 * DELETE /api/admin/subscriptions/[id]
 * Cancels (deletes) a module subscription.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const adminCheck = await requireAdmin(req);
    if (adminCheck) return adminCheck;

    const { id } = await params;
    const supabase = serviceClient();

    const { error } = await supabase
        .from('tenant_subscriptions')
        .delete()
        .eq('id', id);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ success: true });
}
