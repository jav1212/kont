import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/src/shared/backend/utils/require-admin';

/**
 * GET /api/admin/tenants/[id]/members
 * Devuelve los miembros de un tenant (admin only).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const adminCheck = await requireAdmin(req);
    if (adminCheck) return adminCheck;

    const { id } = await params;

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data: rows, error } = await supabase
        .from('tenant_memberships')
        .select('member_id, role, created_at')
        .eq('tenant_id', id);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    const members = rows ?? [];
    if (members.length === 0) return Response.json({ data: [] });

    // member_id in tenant_memberships == tenant_id in admin_tenant_overview
    const memberIds = members.map((r) => r.member_id);
    const { data: tenantRows } = await supabase
        .from('admin_tenant_overview')
        .select('tenant_id, email')
        .in('tenant_id', memberIds);

    const emailMap: Record<string, string> = {};
    for (const row of (tenantRows ?? [])) {
        emailMap[row.tenant_id] = row.email ?? row.tenant_id;
    }

    return Response.json({
        data: members.map((r) => ({
            userId:   r.member_id,
            email:    emailMap[r.member_id] ?? r.member_id,
            role:     r.role,
            joinedAt: r.created_at,
        })),
    });
}
