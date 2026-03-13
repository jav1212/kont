import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/src/shared/backend/utils/require-admin';

/**
 * GET /api/admin/payment-requests
 * Lista solicitudes de pago con filtro opcional por status.
 * Query: ?status=pending|approved|rejected
 */
export async function GET(req: Request) {
    const adminCheck = await requireAdmin(req);
    if (adminCheck) return adminCheck;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    let query = supabase
        .from('payment_requests')
        .select(`
            *,
            tenants (
                id, status, schema_name,
                plans ( name )
            )
        `)
        .order('submitted_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ data: data ?? [] });
}
