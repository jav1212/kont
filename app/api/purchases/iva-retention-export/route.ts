// API route — payload TXT de retenciones IVA del período (SENIAT).
// Devuelve el envelope { agentRif, periodYyyymm, rows } sin formato — el
// frontend construye el TXT y lo descarga con encoding ISO-8859-1.
import { getPurchasesActions } from '@/src/modules/purchases/backend/infra/purchases-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import { handleResult }        from '@/src/shared/backend/utils/handle-result';

export const GET = withTenant(async (req, { userId, actingAs, effectiveOwnerId}) => {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    const period    = searchParams.get('period');
    if (!companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    if (!period)    return Response.json({ error: 'period es requerido' },    { status: 400 });
    const ownerId = effectiveOwnerId;
    const result = await getPurchasesActions(ownerId).getIvaRetentionExport.execute({ companyId, period });
    return handleResult(result);
});
