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
import { CustomerReceivable, customerReceivableId, receivablePaymentId } from "../../src/domain/customer-receivable";

const VES = currency("VES", 2);
const USD = currency("USD", 2);
const EUR = currency("EUR", 2);

test("keeps the debt currency and opening rate as immutable snapshots", () => {
  const mutableUsd = { ...USD };
  const receivable = fixture({ principal: moneyFromDecimal("100", mutableUsd), debtVesRate: rate(mutableUsd, "100") });
  mutableUsd.minorUnit = 0;
  assert.equal(receivable.principal.currency.code, "USD");
  assert.equal(receivable.principal.currency.minorUnit, 2);
  assert.equal(receivable.debtVesRate.vesPerUnit, "100");
});

test("applies a partial cross-currency payment using its captured VES rate", () => {
  const result = fixture().recordPayment(payment({ receivedAmount: moneyFromDecimal("10", EUR), receivedVesRate: rate(EUR, "150") }));
  assert.equal(result.payment.appliedDebtAmount.minorAmount, 1_500n);
  assert.equal(result.receivable.balance.minorAmount, 8_500n);
});

test("rejects a payment whose converted debt amount exceeds the balance", () => {
  assert.throws(
    () => fixture().recordPayment(payment({ receivedAmount: moneyFromDecimal("101", USD), receivedVesRate: rate(USD, "100") })),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_RECEIVABLE_PAYMENT_EXCEEDS_BALANCE",
  );
});

test("replays an identical idempotency key without adding another payment", () => {
  const command = payment();
  const first = fixture().recordPayment(command);
  const replay = first.receivable.recordPayment(command);
  assert.equal(replay.replayed, true);
  assert.equal(replay.receivable.payments.length, 1);
  assert.equal(replay.receivable.version, first.receivable.version);
});

test("rejects invalid calendar due dates when rehydrating the agreement", () => {
  assert.throws(
    () => fixture({ dueDate: "2026-02-30" as never }),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_DATE_INVALID",
  );
});

test("rejects a due date before the confirmed sale date", () => {
  assert.throws(
    () => fixture({ saleDate: salesDate("2026-10-31"), dueDate: salesDate("2026-10-30") }),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_RECEIVABLE_INVALID",
  );
});

test("requires the explicit VES identity rate", () => {
  assert.throws(
    () => fixture({ principal: moneyFromDecimal("100", VES), debtVesRate: rate(VES, "2") }),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_RECEIVABLE_INVALID",
  );
});

function fixture(overrides: Partial<ConstructorParameters<typeof CustomerReceivable>[0]> = {}): CustomerReceivable {
  return new CustomerReceivable({
    id: customerReceivableId("receivable-1"),
    companyId: companyId("company-1"),
    customerId: customerId("customer-1"),
    saleReference: "sale-1",
    saleDate: salesDate("2026-10-01"),
    principal: moneyFromDecimal("100", USD),
    debtVesRate: rate(USD, "100"),
    dueDate: salesDate("2026-10-31"),
    payments: [],
    version: 0,
    ...overrides,
  });
}

function payment(overrides: Partial<Parameters<CustomerReceivable["recordPayment"]>[0]> = {}): Parameters<CustomerReceivable["recordPayment"]>[0] {
  return {
    id: receivablePaymentId("payment-1"),
    idempotencyKey: "payment:1",
    receivedAmount: moneyFromDecimal("10", USD),
    receivedVesRate: rate(USD, "100"),
    occurredAt: salesInstant("2026-10-01T10:00:00.000Z"),
    ...overrides,
  };
}

function rate(currencyDefinition: CurrencyDefinition, vesPerUnit: string): { readonly currency: CurrencyDefinition; readonly vesPerUnit: never; readonly effectiveDate: ReturnType<typeof salesDate>; readonly capturedAt: ReturnType<typeof salesInstant>; readonly source: string } {
  return { currency: currencyDefinition, vesPerUnit: vesPerUnit as never, effectiveDate: salesDate("2026-10-01"), capturedAt: salesInstant("2026-10-01T08:00:00.000Z"), source: "monitor-bcv" };
}
