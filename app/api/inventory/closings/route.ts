// API route for inventory period closures (cierres).
// Calls Postgres RPCs directly — no factory use case exists for this operation yet.
// PostgreSQL RPC parameter names (p_empresa_id, p_periodo, etc.) are kept as-is.
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { ServerSupabaseSource } from '@/src/shared/backend/source/infra/server-supabase';

export const GET = withTenant(async (req, { userId, actingAs }) => {
    const companyId = new URL(req.url).searchParams.get('companyId');
    if (!companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });

    const ownerId = actingAs?.ownerId ?? userId;
    const source = new ServerSupabaseSource();
    const { data, error } = await source.instance.rpc('tenant_inventario_cierres_get', {
        p_user_id:    ownerId,
        p_empresa_id: companyId,
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ data: data ?? [] });
});

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const body = await req.json();
    const { companyId, period, notes, dollarRate } = body;
    if (!companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    if (!period)    return Response.json({ error: 'period es requerido' },    { status: 400 });

    const ownerId = actingAs?.ownerId ?? userId;
    const source = new ServerSupabaseSource();
    const { data, error } = await source.instance.rpc('tenant_inventario_cierre_save', {
        p_user_id:    ownerId,
        p_empresa_id: companyId,
        p_periodo:    period,
        p_notas:      notes ?? '',
        p_tasa_dolar: dollarRate ?? null,
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ data });
});
