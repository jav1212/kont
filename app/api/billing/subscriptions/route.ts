import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { getBillingActions } from '@/src/modules/billing/backend/billing-factory';
import { handleResult } from '@/src/shared/backend/utils/handle-result';

/**
 * GET /api/billing/subscriptions
 * Returns the subscriptions for the active tenant.
 * Supports actingAs: when an admin/contable acts on behalf of a tenant owner,
 * returns that tenant's subscriptions instead of the caller's.
 */
export const GET = withTenant(async (_req, { userId, actingAs }) => {
    const tenantId = actingAs?.ownerId ?? userId;
    const result   = await getBillingActions().getSubscriptions.execute({ tenantId });
    return handleResult(result);
});
