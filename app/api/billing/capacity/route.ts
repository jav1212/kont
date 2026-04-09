import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { getBillingActions } from '@/src/modules/billing/backend/billing-factory';
import { handleResult } from '@/src/shared/backend/utils/handle-result';

/**
 * GET /api/billing/capacity
 * Returns how many companies and employees the tenant can still create based on their plan.
 */
export const GET = withTenant(async (_req, { userId, actingAs }) => {
    const tenantId = actingAs?.ownerId ?? userId;
    const result = await getBillingActions().getCapacity.execute({ userId: tenantId });
    return handleResult(result);
});
