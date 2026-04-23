import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { getBillingActions } from '@/src/modules/billing/backend/billing-factory';
import { handleResult } from '@/src/shared/backend/utils/handle-result';
import { BillingCycle, PaymentMethod } from '@/src/modules/billing/backend/domain/tenant';

/**
 * GET /api/billing/payment-requests
 * Lists the payment requests (comprobantes) submitted by the authenticated tenant.
 *
 * POST /api/billing/payment-requests
 * Body: { planId, billingCycle, amountUsd, paymentMethod, receiptUrl? }
 * Submits a new payment request for review.
 */
export const GET = withTenant(async (_req, { userId, actingAs }) => {
    const tenantId = actingAs?.ownerId ?? userId;
    const result = await getBillingActions().getPaymentRequests.execute({ tenantId });
    return handleResult(result);
});

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const body = await req.json() as {
        planId?:        string;
        billingCycle?:  BillingCycle;
        amountUsd?:     number;
        paymentMethod?: PaymentMethod;
        receiptUrl?:    string | null;
    };

    const tenantId = actingAs?.ownerId ?? userId;
    const result = await getBillingActions().createPaymentRequest.execute({
        tenantId,
        planId:        body.planId        ?? "",
        billingCycle:  body.billingCycle  ?? "monthly",
        amountUsd:     body.amountUsd     ?? 0,
        paymentMethod: body.paymentMethod ?? "transfer",
        receiptUrl:    body.receiptUrl    ?? null,
    });

    return handleResult(result, 201);
});
