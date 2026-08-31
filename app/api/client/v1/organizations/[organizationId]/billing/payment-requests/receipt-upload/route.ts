import type {
  CreatePaymentReceiptUploadDto,
  PaymentReceiptUploadDto,
} from "@kontave/client-contracts";
import { BillingFailure } from "@kontave/billing/domain";
import { createBillingActions } from "@/src/client-api/v1/billing/billing-actions";
import { executeBillingRequest } from "@/src/client-api/v1/billing/execute-billing-request";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await context.params;
  return executeBillingRequest(
    request,
    organizationId,
    async (actor, organization, authorization) => {
      let value: unknown;
      try {
        value = await request.json();
      } catch {
        throw invalidReceipt();
      }
      const body = value as Partial<CreatePaymentReceiptUploadDto> | null;
      if (
        !body ||
        typeof body.fileName !== "string" ||
        typeof body.contentType !== "string"
      )
        throw invalidReceipt();
      return (await createBillingActions().createPaymentReceiptUpload.execute(
        actor,
        organization,
        { fileName: body.fileName, contentType: body.contentType },
        authorization,
      )) satisfies PaymentReceiptUploadDto;
    },
  );
}

function invalidReceipt() {
  return new BillingFailure(
    "BILLING_RECEIPT_INVALID",
    "Los datos del comprobante no son válidos.",
  );
}
