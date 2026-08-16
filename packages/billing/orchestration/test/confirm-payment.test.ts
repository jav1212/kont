import assert from "node:assert/strict";
import test from "node:test";
import { Currency, money } from "@kontave/billing-domain";
import { organizationId } from "@kontave/organizations-domain";
import { PaymentEventType, PaymentProvider, PaymentStatus, type PaymentConfirmed } from "@kontave/payments-domain";
import { ConfirmPayment } from "../src/index";

test("coordinates payment, referral and outbox without coupling their domains", async () => {
  const organization = organizationId("00000000-0000-4000-8000-000000000001");
  const amount = money(BigInt(1_000), Currency.Usd);
  const payment = { id: "payment-1", organizationId: organization, invoiceId: "invoice-1", provider: PaymentProvider.Manual, providerReference: "ref-1", amount, status: PaymentStatus.Confirmed, confirmedAt: "2026-08-11T00:00:00.000Z", createdAt: "2026-08-11T00:00:00.000Z" };
  const event: PaymentConfirmed = { id: "event-1", type: PaymentEventType.Confirmed, paymentId: payment.id, organizationId: organization, invoiceId: payment.invoiceId, amount, isFirstPaidInvoice: true, occurredAt: payment.createdAt };
  const calls: string[] = [];
  const useCase = new ConfirmPayment(
    { async execute() { return { payment, event }; } },
    { async execute(input) { calls.push(`referral:${input.sourceInvoiceId}`); return null; } },
    { async markProcessed(id) { calls.push(`outbox:${id}`); } },
  );
  const result = await useCase.execute({ organizationId: organization, invoiceId: payment.invoiceId, provider: payment.provider, providerReference: payment.providerReference, amount, occurredAt: payment.createdAt, idempotencyKey: "confirm-1" });
  assert.equal(result, payment);
  assert.deepEqual(calls, ["referral:invoice-1", "outbox:event-1"]);
});
