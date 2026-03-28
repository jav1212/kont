import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { getBillingActions } from '@/src/modules/billing/backend/billing-factory';
import { handleResult } from '@/src/shared/backend/utils/handle-result';

/**
 * GET /api/billing/plans
 * Returns all active plans with their associated module slugs.
 */
export const GET = withTenant(async () => {
    const result = await getBillingActions().getPlans.execute();
    return handleResult(result);
});
