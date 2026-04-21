import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { getReferralsActions } from '@/src/modules/referrals/backend/infrastructure/referrals-factory';
import { handleResult } from '@/src/shared/backend/utils/handle-result';

// GET /api/referrals/me
// Devuelve el código de referido del tenant, sus stats y el crédito disponible.
export const GET = withTenant(async (_req, { userId, actingAs }) => {
    const tenantId = actingAs?.ownerId ?? userId;
    const result = await getReferralsActions().getMyReferral.execute({ tenantId });
    return handleResult(result);
});
