// POST /api/companies/apply-sector — applies a sector template to a company.
// Creates default departments, sets inventoryConfig, and persists sector.
import { getCompanyActions } from '@/src/modules/companies/backend/infrastructure/company-factory';
import { handleResult }      from '@/src/shared/backend/utils/handle-result';
import { withTenant }        from '@/src/shared/backend/utils/require-tenant';

export const POST = withTenant(async (req, { userId, actingAs }) => {
    try {
        const { companyId, sector } = await req.json();
        if (!companyId || !sector) {
            return Response.json({ error: 'companyId and sector are required' }, { status: 400 });
        }
        const ownerId = actingAs?.ownerId ?? userId;
        const result = await getCompanyActions(ownerId).applySectorTemplate.execute({ companyId, sector });
        return handleResult(result);
    } catch {
        return Response.json({ error: 'Formato JSON inválido' }, { status: 400 });
    }
});
