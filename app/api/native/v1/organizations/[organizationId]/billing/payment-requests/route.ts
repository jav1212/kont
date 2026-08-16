import { BillingCycle, BillingFailure } from "@kontave/billing-domain";
import type { NativeSubmitManualPaymentRequestDto } from "@kontave/native-api-contracts";
import { createBillingActions } from "@/src/native-api/v1/billing/billing-actions";
import { executeBillingRequest } from "@/src/native-api/v1/billing/execute-billing-request";
import { toManualPaymentRequestDto } from "@/src/native-api/v1/billing/billing-mapper";
export const dynamic = "force-dynamic";
interface Context { readonly params: Promise<{ readonly organizationId: string }> }

export async function GET(request: Request, context: Context) {
  const { organizationId } = await context.params;
  return executeBillingRequest(request, organizationId, async (actor, organization, authorization) => (
    (await createBillingActions().manualPaymentRequests.execute(actor, organization, authorization))
      .map(toManualPaymentRequestDto)
  ));
}

export async function POST(request: Request, context: Context) {
  const { organizationId } = await context.params;
  return executeBillingRequest(request, organizationId, async (actor, organization, authorization) => {
    const body = await readBody(request);
    return toManualPaymentRequestDto(
      await createBillingActions().submitManualPaymentRequest.execute(actor, organization, {
        planId: body.planId,
        billingCycle: body.billingCycle as BillingCycle,
        paymentMethod: body.paymentMethod,
        receiptStorageKey: body.receiptStorageKey,
      }, authorization),
    );
  });
}

async function readBody(request: Request): Promise<NativeSubmitManualPaymentRequestDto> {
  let value: unknown;
  try { value = await request.json(); } catch { throw invalidRequest(); }
  const body = value as Partial<NativeSubmitManualPaymentRequestDto> | null;
  if (!body || typeof body.planId !== "string" || typeof body.billingCycle !== "string" || typeof body.paymentMethod !== "string" || (body.receiptStorageKey !== undefined && body.receiptStorageKey !== null && typeof body.receiptStorageKey !== "string")) throw invalidRequest();
  return body as NativeSubmitManualPaymentRequestDto;
}

function invalidRequest() { return new BillingFailure("BILLING_PAYMENT_REQUEST_INVALID", "La solicitud de pago no es válida."); }
