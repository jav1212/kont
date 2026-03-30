import { getBillingActions } from '@/src/modules/billing/backend/billing-factory';
import { handleResult } from '@/src/shared/backend/utils/handle-result';

/**
 * GET /api/billing/plans
 * Returns all active plans with their associated module slugs.
 */
export async function GET() {
    const result = await getBillingActions().getPlans.execute();
    return handleResult(result);
}
