import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { getBillingActions } from '@/src/modules/billing/backend/billing-factory';
import { handleResult } from '@/src/shared/backend/utils/handle-result';

/**
 * GET /api/billing/tenant
 * Returns the current tenant with plan, status, and billing period.
 */
export const GET = withTenant(async (_req, { userId }) => {
    const result = await getBillingActions().getTenant.execute({ userId });
    return handleResult(result);
});
