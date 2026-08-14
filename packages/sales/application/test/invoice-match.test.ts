import assert from "node:assert/strict";
import test from "node:test";
import { fiscalInvoiceFixture } from "@kontave/fiscal-testing";
import { fiscalDocumentLineId } from "@kontave/fiscal-domain";
import { moneyFromDecimal } from "@kontave/monetary-domain";
import { UnitOfMeasure } from "@kontave/products-domain";
import {
  CustomerInvoiceMatch, SalesFailure, customerInvoiceMatchId, salesInstant, salesQuantity,
} from "@kontave/sales-domain";
import { SALES_COMPANY_ID, SALES_CUSTOMER_ID, SALES_ORDER_LINE_ID, SALES_VES, customerFixture } from "@kontave/sales-testing";
import { ConfirmCustomerInvoiceMatch, type SalesCommitPort } from "../src/index.js";

test("invoice match validates the issued fiscal recipient and explicit unit mapping", async () => {
  const document = fiscalInvoiceFixture({ companyId: SALES_COMPANY_ID }).issue({
    number: "0001", issuedAt: "2026-08-14T10:00:00-04:00", issueDate: "2026-08-14", evidence: null,
  });
  const match = invoiceMatchFixture(document.id);
  const committed: CustomerInvoiceMatch[] = [];
  const useCase = new ConfirmCustomerInvoiceMatch(
    { find: async () => match }, { find: async () => customerFixture() }, { find: async () => document },
    { isCompatible: async (fiscalCode, unit) => fiscalCode === "EA" && unit === UnitOfMeasure.Each },
    commitPort((value) => { committed.push(value); }),
  );
  const confirmed = await useCase.execute(match.id, "2026-08-14T11:00:00-04:00");
  assert.equal(confirmed.status, "confirmed");
  assert.equal(committed[0]?.confirmedAt, salesInstant("2026-08-14T11:00:00-04:00"));
});

test("invoice match rejects an unknown fiscal unit mapping", async () => {
  const document = fiscalInvoiceFixture({ companyId: SALES_COMPANY_ID }).issue({
    number: "0001", issuedAt: "2026-08-14T10:00:00-04:00", issueDate: "2026-08-14", evidence: null,
  });
  const match = invoiceMatchFixture(document.id);
  const useCase = new ConfirmCustomerInvoiceMatch(
    { find: async () => match }, { find: async () => customerFixture() }, { find: async () => document },
    { isCompatible: async () => false }, commitPort(() => undefined),
  );
  await assert.rejects(() => useCase.execute(match.id, "2026-08-14T11:00:00-04:00"),
    (error: unknown) => error instanceof SalesFailure && error.code === "CUSTOMER_INVOICE_MATCH_INVALID");
});

function invoiceMatchFixture(fiscalDocumentId: ReturnType<typeof fiscalInvoiceFixture>["id"]): CustomerInvoiceMatch {
  return new CustomerInvoiceMatch({
    id: customerInvoiceMatchId("match-1"), companyId: SALES_COMPANY_ID, customerId: SALES_CUSTOMER_ID, fiscalDocumentId,
    documentCurrency: SALES_VES, allocatedNetAmount: moneyFromDecimal("50", SALES_VES), status: "draft", confirmedAt: null, version: 0,
    allocations: [{ fiscalLineId: fiscalDocumentLineId("fiscal-line-1"), orderLineId: SALES_ORDER_LINE_ID, dispatchLineId: null, invoicedQuantity: salesQuantity("1", UnitOfMeasure.Each), netAmount: moneyFromDecimal("50", SALES_VES) }],
  });
}

function commitPort(onMatch: (match: CustomerInvoiceMatch) => void): SalesCommitPort {
  return {
    commitDispatch: async () => undefined,
    commitReturn: async () => undefined,
    commitInvoiceMatch: async (match) => onMatch(match),
  };
}
