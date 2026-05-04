// API route — payload XML de retenciones ISLR sobre compras del período (SENIAT).
// Devuelve { agentRif, periodYyyymm, rows } sin formato — el frontend ensambla
// el XML `<RelacionRetencionesISLR>` con encoding ISO-8859-1.
import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const GET = withTenant(async (req, { userId, actingAs }) => {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    const period    = searchParams.get('period');
    if (!companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    if (!period)    return Response.json({ error: 'period es requerido' },    { status: 400 });
    const ownerId = actingAs?.ownerId ?? userId;
    const result = await getInventoryActions(ownerId).getIslrRetentionsExport.execute({ companyId, period });
    return handleResult(result);
});
