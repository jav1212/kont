import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/src/shared/backend/utils/require-admin';

/**
 * GET /api/admin/tenants
 * Lista todos los tenants con métricas (admin only).
 */
export async function GET(req: Request) {
    const adminCheck = await requireAdmin(req);
    if (adminCheck) return adminCheck;

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data, error } = await supabase
        .from('admin_tenant_overview')
        .select('*');

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ data: data ?? [] });
}
