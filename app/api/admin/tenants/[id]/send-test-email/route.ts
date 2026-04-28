import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/src/shared/backend/utils/require-admin';
import { sendTestEmail } from '@/src/shared/backend/utils/send-test-email';

function serviceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

/**
 * POST /api/admin/tenants/[id]/send-test-email
 * Envía un correo branded de prueba al owner del tenant indicado.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const adminCheck = await requireAdmin(req);
    if (adminCheck) return adminCheck;

    const { id } = await params;

    const supabase = serviceClient();
    const { data: tenant, error } = await supabase
        .from('admin_tenant_overview')
        .select('tenant_id, email, plan_name')
        .eq('tenant_id', id)
        .maybeSingle();

    if (error)   return Response.json({ error: error.message }, { status: 500 });
    if (!tenant) return Response.json({ error: 'Tenant no encontrado' }, { status: 404 });
    if (!tenant.email) {
        return Response.json({ error: 'Tenant sin correo asociado' }, { status: 400 });
    }

    const origin = req.headers.get('origin') ?? new URL(req.url).origin;
    const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? origin;

    try {
        const { messageId } = await sendTestEmail({
            to:          tenant.email,
            tenantId:    tenant.tenant_id,
            tenantEmail: tenant.email,
            planName:    tenant.plan_name,
            appUrl,
        });
        return Response.json({ data: { messageId, sentTo: tenant.email } });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Fallo al enviar correo';
        return Response.json({ error: message }, { status: 502 });
    }
}
