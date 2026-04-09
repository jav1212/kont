// Route handler for chart-of-accounts collection: GET (list), POST (create/update).
import { withTenant }             from '@/src/shared/backend/utils/require-tenant';
import { handleResult }           from '@/src/shared/backend/utils/handle-result';
import { getAccountingActions }   from '@/src/modules/accounting/backend/infrastructure/accounting-factory';

export const GET = withTenant(async (req, { userId, actingAs }) => {
    const ownerId     = actingAs?.ownerId ?? userId;
    const companyId   = new URL(req.url).searchParams.get('companyId') ?? '';
    const result      = await getAccountingActions(ownerId).getAccounts.execute(companyId);
    return handleResult(result);
});

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const body    = await req.json() as Record<string, unknown>;
    const result  = await getAccountingActions(ownerId).saveAccount.execute({
        id:           typeof body.id === 'string' ? body.id : undefined,
        companyId:    String(body.companyId ?? ''),
        chartId:      typeof body.chartId === 'string' ? body.chartId : null,
        code:         String(body.code ?? ''),
        name:         String(body.name ?? ''),
        type:         String(body.type ?? ''),
        parentCode:   typeof body.parentCode === 'string' ? body.parentCode : null,
        isActive:     body.isActive !== false,
        isGroup:      body.isGroup === true,
        saldoInicial: Number(body.saldoInicial) || 0,
    });
    return handleResult(result, 201);
});
