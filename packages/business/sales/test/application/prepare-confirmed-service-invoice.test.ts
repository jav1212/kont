import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import {
  fiscalDocumentLineId,
  fiscalTaxDetermination,
  type FiscalDocument,
  type FiscalDocumentRepository,
  type FiscalPersistenceScope,
  FiscalFailure,
} from "@kontave/fiscal/domain";
import { currency, exactDecimal, moneyFromDecimal, moneyFromMinor } from "@kontave/monetary/domain";
import { SalesFailure } from "../../src/domain";
import {
  PrepareConfirmedServiceInvoiceFiscalDocument,
  type ConfirmedServiceInvoice,
} from "../../src/application";

const VES = currency("VES", 2);
const scope: FiscalPersistenceScope = {
  tenantId: "tenant-1",
  organizationId: "organization-1",
  companyId: companyId("company-1"),
};

test("persists a reconciled fiscal draft from a confirmed classified service invoice", async () => {
  const invoice = confirmedInvoice();
  const repository = memoryRepository();
  const useCase = createUseCase(invoice, repository);

  const result = await useCase.execute(command());

  assert.equal(result.replayed, false);
  assert.equal(result.document.status, "draft");
  assert.equal(result.document.lines[0]?.commercialReference, "SERV-CONSULTING");
  assert.equal(result.document.totals.netAmount.minorAmount, 10_000n);
  assert.equal(result.document.totals.taxTotal.minorAmount, 1_600n);
  assert.equal(result.document.totals.payableAmount.minorAmount, 11_600n);
  assert.equal(repository.persisted.length, 1);
  assert.equal(repository.persisted[0]?.source.id, invoice.id);
  assert.equal(repository.persisted[0]?.idempotencyKey, `prepare_legacy_sales_invoice:${invoice.id}`);
});

test("rejects a replay after a snapshotted commercial source field changes and preserves the original snapshot", async () => {
  const original = confirmedInvoice();
  const edited = confirmedInvoice({
    subtotal: amount("200"),
    vatAmount: amount("32"),
    total: amount("232"),
    lines: [serviceLine({ grossAmount: amount("200"), unitPrice: amount("200"), netAmount: amount("200") })],
  });
  const repository = memoryRepository();
  let reads = 0;
  const useCase = new PrepareConfirmedServiceInvoiceFiscalDocument(
    { async find() { reads += 1; return reads === 1 ? original : edited; } },
    issuerReader(),
    taxResolver(),
    repository,
  );

  const first = await useCase.execute(command());
  await assert.rejects(
    () => useCase.execute({ ...command(), occurredAt: "2026-09-28T12:00:00.000Z" }),
    (error: unknown) => error instanceof FiscalFailure && error.code === "FISCAL_DOCUMENT_SOURCE_CONFLICT",
  );

  assert.equal(first.replayed, false);
  assert.equal(repository.persisted[0]?.document, first.document);
  assert.equal(reads, 2);
  assert.equal(repository.persisted.length, 1);
});

test("rejects a replay when the original source is no longer confirmed", async () => {
  const original = confirmedInvoice();
  const repository = memoryRepository();
  let current = original;
  const useCase = new PrepareConfirmedServiceInvoiceFiscalDocument(
    { async find() { return current; } },
    issuerReader(),
    taxResolver(),
    repository,
  );

  await useCase.execute(command());
  current = confirmedInvoice({ status: "anulada" });

  await assert.rejects(
    () => useCase.execute({ ...command(), occurredAt: "2026-09-28T12:00:00.000Z" }),
    (error: unknown) => error instanceof FiscalFailure && error.code === "FISCAL_DOCUMENT_SOURCE_CONFLICT",
  );
  assert.equal(repository.persisted.length, 1);
});

test("rejects a replay when the confirmed invoice operation date changes", async () => {
  const original = confirmedInvoice();
  const repository = memoryRepository();
  let current = original;
  const useCase = new PrepareConfirmedServiceInvoiceFiscalDocument(
    { async find() { return current; } },
    issuerReader(),
    taxResolver(),
    repository,
  );

  await useCase.execute(command());
  current = confirmedInvoice({ invoiceDate: "2026-09-28" });

  await assert.rejects(
    () => useCase.execute({ ...command(), occurredAt: "2026-09-28T12:00:00.000Z" }),
    (error: unknown) => error instanceof FiscalFailure && error.code === "FISCAL_DOCUMENT_SOURCE_CONFLICT",
  );
  assert.equal(repository.persisted.length, 1);
});

test("rejects a replay when the issuer fiscal identity no longer matches the snapshot", async () => {
  const invoice = confirmedInvoice();
  const repository = memoryRepository();
  let legalName = "Issuer C.A.";
  const useCase = new PrepareConfirmedServiceInvoiceFiscalDocument(
    { async find() { return invoice; } },
    {
      async find() {
        return { companyId: scope.companyId, jurisdiction: "VE", taxIdentifier: "J-31217119-7", legalName, fiscalAddress: "Caracas" };
      },
    },
    taxResolver(),
    repository,
  );

  await useCase.execute(command());
  legalName = "Issuer Renamed C.A.";

  await assert.rejects(
    () => useCase.execute({ ...command(), occurredAt: "2026-09-28T12:00:00.000Z" }),
    (error: unknown) => error instanceof FiscalFailure && error.code === "FISCAL_DOCUMENT_SOURCE_CONFLICT",
  );
  assert.equal(repository.persisted.length, 1);
});

test("concurrent preparations converge through the durable idempotency boundary", async () => {
  const invoice = confirmedInvoice();
  const repository = memoryRepository();
  const useCase = createUseCase(invoice, repository);

  const [first, second] = await Promise.all([useCase.execute(command()), useCase.execute(command())]);

  assert.equal(first.document.id, second.document.id);
  assert.equal(first.replayed || second.replayed, true);
  assert.equal(repository.persisted.length, 1);
});

test("rejects an invoice outside the authorized company before taxation or persistence", async () => {
  const invoice = confirmedInvoice({ companyId: companyId("company-2") });
  const repository = memoryRepository();
  let taxCalls = 0;
  const useCase = new PrepareConfirmedServiceInvoiceFiscalDocument(
    { async find() { return invoice; } },
    issuerReader(),
    { async resolveLine() { taxCalls += 1; return taxResolution(); } },
    repository,
  );

  await assert.rejects(() => useCase.execute(command()), (error: unknown) => (
    error instanceof SalesFailure && error.code === "SALES_FISCAL_PREPARATION_INVALID"
  ));
  assert.equal(taxCalls, 0);
  assert.equal(repository.persisted.length, 0);
});

test("rejects source totals that disagree with resolved tax decisions", async () => {
  const invoice = confirmedInvoice({ vatAmount: amount("0"), total: amount("100") });
  const repository = memoryRepository();
  const useCase = createUseCase(invoice, repository);

  await assert.rejects(() => useCase.execute(command()), (error: unknown) => (
    error instanceof SalesFailure && error.code === "SALES_FISCAL_PREPARATION_INVALID"
  ));
  assert.equal(repository.persisted.length, 0);
});

test("requires fiscal addresses for both parties before persisting a draft", async () => {
  const invoice = confirmedInvoice({ customer: { legalName: "Customer C.A.", taxIdentifier: "J-12345678-9", fiscalAddress: null } });
  const repository = memoryRepository();
  const missingIssuerAddress = new PrepareConfirmedServiceInvoiceFiscalDocument(
    { async find() { return invoice; } },
    { async find() { return { companyId: scope.companyId, jurisdiction: "VE", taxIdentifier: "J-31217119-7", legalName: "Issuer C.A.", fiscalAddress: null }; } },
    taxResolver(),
    repository,
  );

  await assert.rejects(() => missingIssuerAddress.execute(command()), (error: unknown) => (
    error instanceof SalesFailure && error.code === "SALES_FISCAL_PREPARATION_INVALID"
  ));
  const missingCustomerAddress = createUseCase(invoice, repository);
  await assert.rejects(() => missingCustomerAddress.execute(command()), (error: unknown) => (
    error instanceof SalesFailure && error.code === "SALES_FISCAL_PREPARATION_INVALID"
  ));
  assert.equal(repository.persisted.length, 0);
});

test("reports a typed currency failure before persistence", async () => {
  const invoice = confirmedInvoice({ total: moneyFromDecimal("116", currency("USD", 2)) });
  const repository = memoryRepository();
  const useCase = createUseCase(invoice, repository);

  await assert.rejects(() => useCase.execute(command()), (error: unknown) => (
    error instanceof SalesFailure && error.code === "SALES_CURRENCY_MISMATCH"
  ));
  assert.equal(repository.persisted.length, 0);
});

function createUseCase(invoice: ConfirmedServiceInvoice, repository: MemoryRepository): PrepareConfirmedServiceInvoiceFiscalDocument {
  return new PrepareConfirmedServiceInvoiceFiscalDocument(
    { async find() { return invoice; } },
    issuerReader(),
    taxResolver(),
    repository,
  );
}

function issuerReader() {
  return {
    async find() {
      return {
        companyId: scope.companyId,
        jurisdiction: "VE",
        taxIdentifier: "J-31217119-7",
        legalName: "Issuer C.A.",
        fiscalAddress: "Caracas",
      };
    },
  };
}

function taxResolver() {
  return {
    async resolveLine(invoice: ConfirmedServiceInvoice, index: number) {
      const line = invoice.lines[index];
      if (!line) throw new Error("Missing service line.");
      return taxResolution(line.id, line.netAmount);
    },
  };
}

function taxResolution(lineId = "sales-line-1", taxableBase = amount("100")) {
  return {
    unitCode: "E48",
    determinations: [fiscalTaxDetermination({
      taxCode: "IVA",
      category: "taxable",
      calculationMode: "tax_exclusive",
      rate: exactDecimal("16"),
      taxableBase,
      amount: moneyFromMinor((taxableBase.minorAmount * 16n) / 100n, VES),
      jurisdiction: "VE",
      ruleVersion: "ve-iva-16-v1",
      source: { kind: "line", lineId: fiscalDocumentLineId(lineId) },
    })],
  };
}

function confirmedInvoice(overrides: Partial<ConfirmedServiceInvoice> = {}): ConfirmedServiceInvoice {
  return {
    id: "sales-invoice-1",
    companyId: scope.companyId,
    customerId: "customer-1",
    invoiceNumber: "FV-1",
    documentType: "venta",
    status: "confirmada",
    invoiceDate: "2026-09-27",
    currencyCode: "VES",
    subtotal: amount("100"),
    vatAmount: amount("16"),
    total: amount("116"),
    documentDiscount: amount("0"),
    documentSurcharge: amount("0"),
    financialTaxAmount: amount("0"),
    customer: { legalName: "Customer C.A.", taxIdentifier: "J-12345678-9", fiscalAddress: "Caracas" },
    lines: [serviceLine()],
    ...overrides,
  };
}

function serviceLine(overrides: Partial<ConfirmedServiceInvoice["lines"][number]> = {}) {
  return {
    id: "sales-line-1",
    productId: null,
    serviceTaxCode: "SERV-CONSULTING",
    description: "Consulting service",
    quantity: exactDecimal("1"),
    grossAmount: amount("100"),
    unitPrice: amount("100"),
    discountAmount: amount("0"),
    surchargeAmount: amount("0"),
    netAmount: amount("100"),
    ...overrides,
  };
}

function amount(value: string) {
  return moneyFromDecimal(value, VES);
}

function command() {
  return {
    scope,
    invoiceId: "sales-invoice-1",
    actorId: "user-1",
    occurredAt: "2026-09-27T12:00:00.000Z",
  };
}

type MemoryRepository = FiscalDocumentRepository & {
  readonly persisted: Array<Parameters<FiscalDocumentRepository["persist"]>[0]>;
};

function memoryRepository(): MemoryRepository {
  const documents = new Map<string, FiscalDocument>();
  const persisted: Array<Parameters<FiscalDocumentRepository["persist"]>[0]> = [];
  return {
    persisted,
    async find(_scope, id) { return documents.get(id) ?? null; },
    async list() { return { items: [], nextCursor: null }; },
    async listEvents() { return { items: [], nextCursor: null }; },
    async persist(input) {
      const prior = documents.get(input.document.id);
      if (prior) return { document: prior, replayed: true };
      documents.set(input.document.id, input.document);
      persisted.push(input);
      return { document: input.document, replayed: false };
    },
    async appendIssuanceAttempt() { throw new Error("Issuance is outside this preparation test."); },
  };
}
