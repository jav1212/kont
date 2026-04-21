import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { getReferralsActions } from '@/src/modules/referrals/backend/infrastructure/referrals-factory';
import { handleResult } from '@/src/shared/backend/utils/handle-result';

// POST /api/referrals/attach
// Body: { code: string }
// Vincula al tenant autenticado con el referidor dueño del código. Idempotente.
export const POST = withTenant(async (req, { userId, actingAs }) => {
    const tenantId = actingAs?.ownerId ?? userId;

    let body: { code?: string };
    try {
        body = (await req.json()) as { code?: string };
    } catch {
        return Response.json({ error: 'Formato JSON inválido' }, { status: 400 });
    }

    const result = await getReferralsActions().attachReferrer.execute({
        tenantId,
        code: body.code ?? '',
    });

    return handleResult(result);
});
