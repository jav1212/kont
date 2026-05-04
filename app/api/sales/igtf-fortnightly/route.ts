// IGTF percepción quincenal aggregate (Forma 99021) for Sales.
import { getSalesActions } from '@/src/modules/sales/backend/infra/sales-factory';
import { withTenant }      from '@/src/shared/backend/utils/require-tenant';
import { handleResult }    from '@/src/shared/backend/utils/handle-result';

export const GET = withTenant(async (req, { userId, actingAs }) => {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    const year      = parseInt(searchParams.get('year')  ?? '', 10);
    const month     = parseInt(searchParams.get('month') ?? '', 10);
    const quincena  = parseInt(searchParams.get('quincena') ?? '', 10);

    if (!companyId)              return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    if (!Number.isInteger(year)) return Response.json({ error: 'year inválido' },          { status: 400 });
    if (!Number.isInteger(month))return Response.json({ error: 'month inválido' },         { status: 400 });
    if (quincena !== 1 && quincena !== 2) return Response.json({ error: 'quincena inválida (1 o 2)' }, { status: 400 });

    const ownerId = actingAs?.ownerId ?? userId;
    const result  = await getSalesActions(ownerId).getIgtfFortnightlyReport.execute({
        companyId, year, month, quincena: quincena as 1 | 2,
    });
    return handleResult(result);
});
