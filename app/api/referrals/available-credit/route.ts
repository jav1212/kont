import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { getReferralsActions } from '@/src/modules/referrals/backend/infrastructure/referrals-factory';
import { handleResult } from '@/src/shared/backend/utils/handle-result';

// GET /api/referrals/available-credit
// Devuelve el monto USD disponible como descuento en la próxima factura.
export const GET = withTenant(async (_req, { userId, actingAs }) => {
    const tenantId = actingAs?.ownerId ?? userId;
    const result = await getReferralsActions().getAvailableCredit.execute({ tenantId });
    return handleResult(result);
});
