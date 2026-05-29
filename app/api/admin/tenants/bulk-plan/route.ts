import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/src/shared/backend/utils/require-admin';

function serviceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

const VALID_STATUS = new Set(['active', 'trial', 'suspended']);

/**
 * POST /api/admin/tenants/bulk-plan
 * Asigna un plan (y opcionalmente estado) a varios tenants en una sola operación.
 * Body: { tenantIds: string[], planId: string, status?: 'active'|'trial'|'suspended' }
 */
export async function POST(req: Request) {
    const adminCheck = await requireAdmin(req);
    if (adminCheck) return adminCheck;

    try {
        const body = await req.json();

        const ids = Array.isArray(body.tenantIds)
            ? body.tenantIds.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
            : [];
        const planId = typeof body.planId === 'string' ? body.planId : '';

        if (ids.length === 0) {
            return Response.json({ error: 'Debes seleccionar al menos un tenant.' }, { status: 400 });
        }
        if (!planId) {
            return Response.json({ error: 'Falta el plan a asignar.' }, { status: 400 });
        }

        const update: Record<string, unknown> = {
            plan_id:    planId,
            updated_at: new Date().toISOString(),
        };
        if (typeof body.status === 'string' && VALID_STATUS.has(body.status)) {
            update.status = body.status;
        }

        const supabase = serviceClient();
        const { data, error } = await supabase
            .from('tenants')
            .update(update)
            .in('id', ids)
            .select('id');

        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({ data: { updated: data?.length ?? 0 } });
    } catch {
        return Response.json({ error: 'Formato JSON inválido' }, { status: 400 });
    }
}
