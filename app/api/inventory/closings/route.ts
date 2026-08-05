// API route for inventory period closures (cierres).
// Calls Postgres RPCs directly — no factory use case exists for this operation yet.
// PostgreSQL RPC parameter names (p_empresa_id, p_periodo, etc.) are kept as-is.
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { ServerSupabaseSource } from '@/src/shared/backend/source/infra/server-supabase';
import { isSharedSchemaEnabled } from '@/src/shared/backend/config/shared-schema-pilot';

export const GET = withTenant(async (req, { userId, actingAs, effectiveOwnerId, tenantId}) => {
    const companyId = new URL(req.url).searchParams.get('companyId');
    if (!companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });

    const source = new ServerSupabaseSource();
    if (isSharedSchemaEnabled(tenantId)) {
        const { data, error } = await source.instance
            .from('shared_inventory_closures')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('company_id', companyId)
            .order('period', { ascending: false });
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json({ data: data ?? [] });
    }

    const ownerId = effectiveOwnerId;
    const { data, error } = await source.instance.rpc('tenant_inventario_cierres_get', {
        p_user_id:    ownerId,
        p_empresa_id: companyId,
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ data: data ?? [] });
});

export const POST = withTenant(async (req, { userId, actingAs, effectiveOwnerId, tenantId}) => {
    const body = await req.json();
    const { companyId, period, notes, dollarRate } = body;
    if (!companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    if (!period)    return Response.json({ error: 'period es requerido' },    { status: 400 });
    if (!/^\d{4}-\d{2}$/.test(period)) {
        return Response.json({ error: 'period debe tener formato YYYY-MM' }, { status: 400 });
    }

    const source = new ServerSupabaseSource();
    if (isSharedSchemaEnabled(tenantId)) {
        const { data: existing, error: existingError } = await source.instance
            .from('shared_inventory_closures')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('company_id', companyId)
            .eq('period', period)
            .maybeSingle();
        if (existingError) return Response.json({ error: existingError.message }, { status: 400 });

        const { data, error } = await source.instance
            .from('shared_inventory_closures')
            .upsert({
                tenant_id: tenantId,
                id: existing?.id ?? crypto.randomUUID(),
                company_id: companyId,
                period,
                notes: notes ?? '',
                dollar_rate: dollarRate ?? null,
                closed_at: new Date().toISOString(),
            }, { onConflict: 'tenant_id,company_id,period' })
            .select('*')
            .single();
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json({ data });
    }

    const ownerId = effectiveOwnerId;
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
