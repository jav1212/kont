import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { ServerSupabaseSource } from '@/src/shared/backend/source/infra/server-supabase';

export const GET = withTenant(async (req, { userId }) => {
    const empresaId = new URL(req.url).searchParams.get('empresaId');
    if (!empresaId) return Response.json({ error: 'empresaId es requerido' }, { status: 400 });

    const source = new ServerSupabaseSource();
    const { data, error } = await source.instance.rpc('tenant_inventario_cierres_get', {
        p_user_id:    userId,
        p_empresa_id: empresaId,
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ data: data ?? [] });
});

export const POST = withTenant(async (req, { userId }) => {
    const body = await req.json();
    const { empresaId, periodo, notas } = body;
    if (!empresaId) return Response.json({ error: 'empresaId es requerido' }, { status: 400 });
    if (!periodo)   return Response.json({ error: 'periodo es requerido' }, { status: 400 });

    const source = new ServerSupabaseSource();
    const { data, error } = await source.instance.rpc('tenant_inventario_cierre_save', {
        p_user_id:    userId,
        p_empresa_id: empresaId,
        p_periodo:    periodo,
        p_notas:      notas ?? '',
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ data });
});
