import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/src/shared/backend/utils/require-admin';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * PATCH /api/admin/payment-requests/[id]
 * Aprueba o rechaza una solicitud de pago.
 * Body: { action: 'approve' | 'reject', notes? }
 *
 * Al aprobar:
 *  - payment_request.status = 'approved'
 *  - tenant.status = 'active'
 *  - tenant.last_payment_at = now
 *  - tenant.current_period_start/end según billing_cycle
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const adminCheck = await requireAdmin(req);
    if (adminCheck) return adminCheck;

    try {
        const { id } = await params;
        const { action, notes } = await req.json();

        if (!['approve', 'reject'].includes(action)) {
            return Response.json({ error: 'action debe ser approve o reject' }, { status: 400 });
        }

        const cookieStore = await cookies();
        const authClient = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
        );
        const { data: { user } } = await authClient.auth.getUser();

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        );

        // Obtener la solicitud
        const { data: pr, error: prError } = await supabase
            .from('payment_requests')
            .select('*')
            .eq('id', id)
            .single();

        if (prError || !pr) return Response.json({ error: 'Solicitud no encontrada' }, { status: 404 });

        const now = new Date();

        // Actualizar la solicitud
        await supabase
            .from('payment_requests')
            .update({
                status:      action === 'approve' ? 'approved' : 'rejected',
                notes:       notes ?? null,
                reviewed_at: now.toISOString(),
                reviewed_by: user?.id ?? null,
            })
            .eq('id', id);

        // Si se aprueba, activar el tenant y calcular período
        if (action === 'approve') {
            const periodStart = now;
            const periodEnd   = new Date(now);

            if (pr.billing_cycle === 'monthly')    periodEnd.setMonth(periodEnd.getMonth() + 1);
            if (pr.billing_cycle === 'quarterly')  periodEnd.setMonth(periodEnd.getMonth() + 3);
            if (pr.billing_cycle === 'annual')     periodEnd.setFullYear(periodEnd.getFullYear() + 1);

            await supabase
                .from('tenants')
                .update({
                    status:               'active',
                    plan_id:              pr.plan_id,
                    billing_cycle:        pr.billing_cycle,
                    last_payment_at:      now.toISOString(),
                    current_period_start: periodStart.toISOString().split('T')[0],
                    current_period_end:   periodEnd.toISOString().split('T')[0],
                    updated_at:           now.toISOString(),
                })
                .eq('id', pr.tenant_id);
        }

        return Response.json({ data: { ok: true } });
    } catch {
        return Response.json({ error: 'Formato JSON inválido' }, { status: 400 });
    }
}
