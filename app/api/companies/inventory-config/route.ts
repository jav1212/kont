// GET/PATCH /api/companies/inventory-config — read/update inventory config for a company.
// Stores custom field definitions, visible columns, and sector defaults.
import { getCompanyActions } from '@/src/modules/companies/backend/infrastructure/company-factory';
import { handleResult }      from '@/src/shared/backend/utils/handle-result';
import { withTenantPermission } from '@/src/shared/backend/utils/require-tenant';

export const GET = withTenantPermission('companies.read', async (req, { userId, actingAs, effectiveOwnerId, tenantId}) => {
    try {
        const { searchParams } = new URL(req.url);
        const companyId = searchParams.get('companyId');
        if (!companyId) {
            return Response.json({ error: 'companyId is required' }, { status: 400 });
        }
        const ownerId = effectiveOwnerId;
        const result = await getCompanyActions(tenantId).repository.getInventoryConfig(companyId);
        return handleResult(result);
    } catch {
        return Response.json({ error: 'Error reading inventory config' }, { status: 500 });
    }
});

export const PATCH = withTenantPermission('companies.update', async (req, { userId, actingAs, effectiveOwnerId, tenantId}) => {
    try {
        const { companyId, config } = await req.json();
        if (!companyId || !config) {
            return Response.json({ error: 'companyId and config are required' }, { status: 400 });
        }
        const ownerId = effectiveOwnerId;
        const result = await getCompanyActions(tenantId).repository.saveInventoryConfig(companyId, config);
        return handleResult(result);
    } catch {
        return Response.json({ error: 'Formato JSON inválido' }, { status: 400 });
    }
});
