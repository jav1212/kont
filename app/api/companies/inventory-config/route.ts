// GET/PATCH /api/companies/inventory-config — read/update inventory config for a company.
// Stores custom field definitions, visible columns, and sector defaults.
import { getCompanyActions } from '@/src/modules/companies/backend/infrastructure/company-factory';
import { handleResult }      from '@/src/shared/backend/utils/handle-result';
import { withTenant }        from '@/src/shared/backend/utils/require-tenant';

export const GET = withTenant(async (req, { userId, actingAs }) => {
    try {
        const { searchParams } = new URL(req.url);
        const companyId = searchParams.get('companyId');
        if (!companyId) {
            return Response.json({ error: 'companyId is required' }, { status: 400 });
        }
        const ownerId = actingAs?.ownerId ?? userId;
        const result = await getCompanyActions(ownerId).repository.getInventoryConfig(companyId);
        return handleResult(result);
    } catch {
        return Response.json({ error: 'Error reading inventory config' }, { status: 500 });
    }
});

export const PATCH = withTenant(async (req, { userId, actingAs }) => {
    try {
        const { companyId, config } = await req.json();
        if (!companyId || !config) {
            return Response.json({ error: 'companyId and config are required' }, { status: 400 });
        }
        const ownerId = actingAs?.ownerId ?? userId;
        const result = await getCompanyActions(ownerId).repository.saveInventoryConfig(companyId, config);
        return handleResult(result);
    } catch {
        return Response.json({ error: 'Formato JSON inválido' }, { status: 400 });
    }
});
