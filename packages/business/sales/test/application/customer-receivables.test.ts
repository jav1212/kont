import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { currency, moneyFromDecimal, type CurrencyDefinition } from "@kontave/monetary/domain";
import { SalesFailure, customerId, salesDate, salesInstant } from "../../src/domain";
import { customerReceivableId, type CustomerReceivable } from "../../src/domain/customer-receivable";
import {
  CreateCustomerReceivableFromConfirmedCreditInvoice,
  ListCustomerReceivables,
  type CustomerReceivableCreator,
  type CustomerReceivablesReader,
} from "../../src/application/customer-receivables";

const USD = currency("USD", 2);
const COMPANY = companyId("company-1");
const CUSTOMER = customerId("customer-1");

test("creates a receivable from a confirmed identified credit invoice", async () => {
  const persisted: CustomerReceivable[] = [];
  const creator: CustomerReceivableCreator = { createAtomically: async (receivable) => { persisted.push(receivable); return receivable; } };
  const result = await new CreateCustomerReceivableFromConfirmedCreditInvoice(creator).execute(invoice());
  assert.equal(result.principal.currency.code, "USD");
  assert.equal(persisted.length, 1);
});

test("rejects a credit invoice without the caller's identified-customer signal", async () => {
  const creator: CustomerReceivableCreator = { createAtomically: async (receivable) => receivable };
  await assert.rejects(
    () => new CreateCustomerReceivableFromConfirmedCreditInvoice(creator).execute(invoice({ customerIdentified: false })),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_RECEIVABLE_INVALID",
  );
});

test("lists receivables through a company-scoped port with payment ledgers", async () => {
  let queryCompany = "";
  const reader: CustomerReceivablesReader = { list: async (query) => { queryCompany = query.companyId; return []; } };
  const result = await new ListCustomerReceivables(reader).execute({ companyId: COMPANY, customerId: CUSTOMER });
  assert.deepEqual(result, []);
  assert.equal(queryCompany, COMPANY);
});

function invoice(overrides: Partial<Parameters<CreateCustomerReceivableFromConfirmedCreditInvoice["execute"]>[0]> = {}): Parameters<CreateCustomerReceivableFromConfirmedCreditInvoice["execute"]>[0] {
  return {
    receivableId: customerReceivableId("receivable-1"), companyId: COMPANY, customerId: CUSTOMER, customerIdentified: true,
    invoiceReference: "invoice-1", saleDate: salesDate("2026-10-01"), principal: moneyFromDecimal("100", USD),
    debtVesRate: rate(USD, "100"), dueDate: salesDate("2026-10-31"), ...overrides,
  };
}

function rate(currencyDefinition: CurrencyDefinition, vesPerUnit: string): { readonly currency: CurrencyDefinition; readonly vesPerUnit: never; readonly effectiveDate: ReturnType<typeof salesDate>; readonly capturedAt: ReturnType<typeof salesInstant>; readonly source: string } {
  return { currency: currencyDefinition, vesPerUnit: vesPerUnit as never, effectiveDate: salesDate("2026-10-01"), capturedAt: salesInstant("2026-10-01T08:00:00.000Z"), source: "monitor-bcv" };
}
