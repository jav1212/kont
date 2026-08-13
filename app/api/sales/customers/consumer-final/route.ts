import { getSalesActions } from '@/src/modules/sales/backend/infra/sales-factory';
import { withTenantPermission } from '@/src/shared/backend/utils/require-tenant';
import { handleResult } from '@/src/shared/backend/utils/handle-result';

export const POST = withTenantPermission('sales.create', async (req, { tenantId }) => {
    const body = await req.json().catch(() => ({})) as { companyId?: string };
    if (!body.companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });

    const result = await getSalesActions(tenantId).saveCustomer.execute({
        id: `consumer-final:${body.companyId}`,
        companyId: body.companyId,
        rif: 'V-00000000-0',
        name: 'CONSUMIDOR FINAL',
        contact: '', phone: '', email: '', address: '',
        notes: 'Cliente predeterminado para ventas de punto de venta.',
        active: true,
    });
    return handleResult(result);
});
