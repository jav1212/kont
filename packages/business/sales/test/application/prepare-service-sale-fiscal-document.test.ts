import assert from "node:assert/strict";
import test from "node:test";
import { exactDecimal, moneyFromMinor } from "@kontave/monetary/domain";
import {
  fiscalDocumentLineId,
  fiscalTaxDetermination,
  type FiscalDocumentRepository,
  type FiscalPersistenceScope,
  type FiscalDocument,
} from "@kontave/fiscal/domain";
import {
  customerFixture,
  approvedSalesOrderFixture,
  SALES_COMPANY_ID,
} from "../../src/testing";
import { Customer, SalesOrder } from "../../src/domain";
import { PrepareServiceSaleFiscalDocument } from "../../src/application/prepare-service-sale-fiscal-document";

const scope: FiscalPersistenceScope = {
  tenantId: "tenant-1",
  organizationId: "organization-1",
  companyId: SALES_COMPANY_ID,
};

const unusedFiscalRepository: FiscalDocumentRepository = {
  async find() { return null; },
  async list() { return { items: [], nextCursor: null }; },
  async listEvents() { return { items: [], nextCursor: null }; },
  async persist() { throw new Error("persistence must not run"); },
  async appendIssuanceAttempt() { throw new Error("issuance must not run"); },
};

test("prepares a server-resolved fiscal snapshot from an approved service order", async () => {
  const base = approvedSalesOrderFixture();
  const order = new SalesOrder({
    ...base,
    lines: base.lines.map((line) => ({ ...line, kind: "service", productId: null })),
  });
  const customer = customerFixture();
  const captures: { saved?: Parameters<FiscalDocumentRepository["persist"]>[0] } = {};
  let storedDocument: FiscalDocument | null = null;
  let persistenceCount = 0;
  let taxResolutionCount = 0;
  const fiscalRepository = {
    async find() { return storedDocument; },
    async list() { return { items: [], nextCursor: null }; },
    async listEvents() { return { items: [], nextCursor: null }; },
    async persist(input: Parameters<FiscalDocumentRepository["persist"]>[0]) {
      captures.saved = input;
      storedDocument = input.document;
      persistenceCount += 1;
      return { document: input.document, replayed: false };
    },
    async appendIssuanceAttempt() { throw new Error("not used"); },
  } satisfies FiscalDocumentRepository;
  const useCase = new PrepareServiceSaleFiscalDocument(
    { async find() { return order; } },
    { async find() { return customer; } },
    { async find(companyId) { return { companyId, jurisdiction: "VE", taxIdentifier: "J-31217119-7", legalName: "Issuer C.A.", fiscalAddress: "Caracas" }; } },
    {
      async resolveLine(candidate, lineIndex) {
        taxResolutionCount += 1;
        const line = candidate.lines[lineIndex]!;
        return {
          jurisdiction: "VE",
          unitCode: "E48",
          determinations: [fiscalTaxDetermination({
            taxCode: "IVA",
            category: "exempt",
            calculationMode: "tax_exclusive",
            rate: exactDecimal("0"),
            taxableBase: line.netAmount,
            amount: moneyFromMinor(0n, line.netAmount.currency),
            jurisdiction: "VE",
            ruleVersion: "ve-iva-exempt-v1",
            source: { kind: "line", lineId: fiscalDocumentLineId(line.id) },
          })],
        };
      },
    },
    fiscalRepository,
  );

  const result = await useCase.execute({ scope, orderId: order.id, actorId: "user-1", occurredAt: "2026-09-25T12:00:00.000Z" });

  assert.equal(result.document.status, "draft");
  assert.equal(result.document.companyId, SALES_COMPANY_ID);
  assert.equal(result.document.lines[0]?.description, order.lines[0]?.description);
  assert.equal(result.document.taxDeterminations[0]?.source.kind, "line");
  assert.equal(result.document.totals.payableAmount.minorAmount, order.lines[0]?.netAmount.minorAmount);
  assert.equal(result.document.totals.outstandingAmount.minorAmount, result.document.totals.payableAmount.minorAmount);
  assert.equal(result.document.payments.length, 0);
  assert.equal(captures.saved?.source.kind, "sales_order");
  assert.equal(captures.saved?.source.id, order.id);
  assert.equal(captures.saved?.idempotencyKey, `prepare_sales_order:${order.id}`);

  const replay = await useCase.execute({ scope, orderId: order.id, actorId: "user-1", occurredAt: "2026-09-26T09:00:00.000Z" });
  assert.equal(replay.replayed, true);
  assert.equal(replay.document, result.document);
  assert.equal(persistenceCount, 1);
  assert.equal(taxResolutionCount, 1);
});

test("does not prepare fiscal documents for stock orders in the service circuit", async () => {
  const order = approvedSalesOrderFixture();
  const useCase = new PrepareServiceSaleFiscalDocument(
    { async find() { return order; } },
    { async find(): Promise<Customer | null> { return customerFixture(); } },
    { async find() { return null; } },
    { async resolveLine() { throw new Error("tax resolution must not run"); } },
    unusedFiscalRepository,
  );

  await assert.rejects(() => useCase.execute({
    scope,
    orderId: order.id,
    actorId: "user-1",
    occurredAt: "2026-09-25T12:00:00.000Z",
  }), /service-only order/);
});

test("requires an explicit tax determination for every service line", async () => {
  const base = approvedSalesOrderFixture();
  const order = new SalesOrder({ ...base, lines: base.lines.map((line) => ({ ...line, kind: "service", productId: null })) });
  const useCase = new PrepareServiceSaleFiscalDocument(
    { async find() { return order; } },
    { async find() { return customerFixture(); } },
    { async find(companyId) { return { companyId, jurisdiction: "VE", taxIdentifier: "J-31217119-7", legalName: "Issuer C.A.", fiscalAddress: null }; } },
    { async resolveLine() { return { jurisdiction: "VE", unitCode: "E48", determinations: [] }; } },
    unusedFiscalRepository,
  );

  await assert.rejects(() => useCase.execute({
    scope,
    orderId: order.id,
    actorId: "user-1",
    occurredAt: "2026-09-25T12:00:00.000Z",
  }), /no complete tax or fiscal-unit determination/);
});
