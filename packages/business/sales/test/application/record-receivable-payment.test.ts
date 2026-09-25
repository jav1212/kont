import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { currency, moneyFromDecimal, type CurrencyDefinition } from "@kontave/monetary/domain";
import {
  SalesFailure,
  customerId,
  salesDate,
  salesInstant,
} from "../../src/domain";
import { CustomerReceivable, customerReceivableId, receivablePaymentId, type RecordReceivablePaymentResult } from "../../src/domain/customer-receivable";
import {
  RecordCustomerReceivablePayment,
  type ReceivablePaymentRecorder,
} from "../../src/application/record-receivable-payment";

const USD = currency("USD", 2);

test("uses the atomic recorder so retries return one persisted payment", async () => {
  let receivable = fixture();
  let commits = 0;
  const recorder: ReceivablePaymentRecorder = {
    async recordAtomically(request): Promise<RecordReceivablePaymentResult> {
      const result = receivable.recordPayment(request.payment);
      if (!result.replayed) {
        commits += 1;
        receivable = result.receivable;
      }
      return result;
    },
  };
  const useCase = new RecordCustomerReceivablePayment(recorder);
  const request = { receivableId: receivable.id, payment: command() };
  const first = await useCase.execute(request);
  const second = await useCase.execute(request);
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.equal(commits, 1);
});

test("translates unexpected port failures into the typed sales failure", async () => {
  const useCase = new RecordCustomerReceivablePayment({ recordAtomically: async () => { throw new Error("connection lost"); } });
  await assert.rejects(
    () => useCase.execute({ receivableId: customerReceivableId("receivable-1"), payment: command() }),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_REPOSITORY_UNAVAILABLE",
  );
});

function fixture(): CustomerReceivable {
  return new CustomerReceivable({
    id: customerReceivableId("receivable-1"), companyId: companyId("company-1"), customerId: customerId("customer-1"), saleReference: "sale-1",
    saleDate: salesDate("2026-10-01"), principal: moneyFromDecimal("100", USD), debtVesRate: rate(USD, "100"), dueDate: salesDate("2026-10-31"), payments: [], version: 0,
  });
}

function command(): Parameters<CustomerReceivable["recordPayment"]>[0] {
  return {
    id: receivablePaymentId("payment-1"), idempotencyKey: "payment:1", receivedAmount: moneyFromDecimal("10", USD),
    receivedVesRate: rate(USD, "100"), occurredAt: salesInstant("2026-10-01T10:00:00.000Z"),
  };
}

function rate(currencyDefinition: CurrencyDefinition, vesPerUnit: string): { readonly currency: CurrencyDefinition; readonly vesPerUnit: never; readonly effectiveDate: ReturnType<typeof salesDate>; readonly capturedAt: ReturnType<typeof salesInstant>; readonly source: string } {
  return { currency: currencyDefinition, vesPerUnit: vesPerUnit as never, effectiveDate: salesDate("2026-10-01"), capturedAt: salesInstant("2026-10-01T08:00:00.000Z"), source: "monitor-bcv" };
}
