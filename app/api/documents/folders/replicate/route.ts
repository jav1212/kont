import { withTenant }        from '@/src/shared/backend/utils/require-tenant';
import { handleResult }      from '@/src/shared/backend/utils/handle-result';
import { getDocumentsActions } from '@/src/modules/documents/backend/infrastructure/documents-factory';
import { ServerSupabaseSource } from '@/src/shared/backend/source/infra/server-supabase';

export const POST = withTenant(async (req, { userId, actingAs }) => {
    if (actingAs) {
        return Response.json({ error: 'Solo puedes replicar tu propia plantilla' }, { status: 403 });
    }

    const body: { tenantIds?: string[]; folderIds?: string[] } = await req.json().catch(() => ({}));

    // Verificar que los tenantIds recibidos son realmente clientes del usuario (rol contable)
    const server = new ServerSupabaseSource();
    const { data: memberships, error } = await server.instance
        .from('tenant_memberships')
        .select('tenant_id')
        .eq('member_id', userId)
        .eq('role', 'contable')
        .not('accepted_at', 'is', null)
        .is('revoked_at', null);

    if (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }

    const allClientIds = new Set((memberships ?? []).map((m: { tenant_id: string }) => m.tenant_id));

    // Si se pasan tenantIds, filtrar solo los válidos; si no, usar todos
    const clientTenantIds = body.tenantIds
        ? body.tenantIds.filter((id) => allClientIds.has(id))
        : [...allClientIds];

    if (!clientTenantIds.length) {
        return Response.json({ data: { results: [] } });
    }

    const { replicateFolders } = getDocumentsActions(userId);
    const result = await replicateFolders.execute({
        clientTenantIds,
        createdBy:       userId,
        sourceFolderIds: body.folderIds,
    });

    return handleResult(result);
});
