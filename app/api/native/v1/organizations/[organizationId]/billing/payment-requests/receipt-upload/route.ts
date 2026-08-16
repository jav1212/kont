import type { NativeCreatePaymentReceiptUploadDto, NativePaymentReceiptUploadDto } from "@kontave/native-api-contracts";
import { BillingFailure } from "@kontave/billing-domain";
import { createBillingActions } from "@/src/native-api/v1/billing/billing-actions";
import { executeBillingRequest } from "@/src/native-api/v1/billing/execute-billing-request";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await context.params;
  return executeBillingRequest(request, organizationId, async (actor, organization, authorization) => {
    let value: unknown;
    try { value = await request.json(); } catch { throw invalidReceipt(); }
    const body = value as Partial<NativeCreatePaymentReceiptUploadDto> | null;
    if (!body || typeof body.fileName !== "string" || typeof body.contentType !== "string") throw invalidReceipt();
    return await createBillingActions().createPaymentReceiptUpload.execute(
      actor, organization, { fileName: body.fileName, contentType: body.contentType }, authorization,
    ) satisfies NativePaymentReceiptUploadDto;
  });
}

function invalidReceipt() { return new BillingFailure("BILLING_RECEIPT_INVALID", "Los datos del comprobante no son válidos."); }
