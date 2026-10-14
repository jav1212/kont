import assert from "node:assert/strict";
import { test } from "node:test";
import {
  IssueSalesInvoiceWithDocumentSeries,
  type IssueSalesInvoiceWithDocumentSeriesCommand,
  type SalesInvoiceDocumentSeriesIssuanceRepository,
} from "../../src/application";
import { SalesFailure } from "../../src/domain";
import { companyId } from "@kontave/companies/domain";
import type { OrganizationId } from "@kontave/organizations/domain";
import type { CompanyId } from "@kontave/companies/domain";
import { fiscalInvoiceFixture } from "@kontave/fiscal/testing";
import { fiscalDocumentTaxFactForSalesSeriesIssue } from "@kontave/tax-reporting/fiscal-document-mapper";
import type { FiscalDocumentFactMetadata } from "@kontave/tax-reporting/fiscal-document-mapper";
import type { TaxReportingScope } from "@kontave/tax-reporting/domain";

const organizationId = "8e2403ad-a266-4ffc-8680-b744f241001e" as OrganizationId;
const companyIdValue = "company" as CompanyId;
const branchId = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const seriesId = "7be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const draft = fiscalInvoiceFixture({ companyId: companyIdValue });
const taxScope: TaxReportingScope = { tenantId: "1e2403ad-a266-4ffc-8680-b744f241001e", organizationId, companyId: companyIdValue };
const issuedAt = "2026-10-01T10:00:00.000Z";
const factMetadata: FiscalDocumentFactMetadata = { factId: "fact-1", lineageKey: "sale:invoice", recognitionDate: "2026-10-01", counterpartyCountryCode: "VE", withholding: null, affectedFactId: null, recordedAt: issuedAt };
const command: IssueSalesInvoiceWithDocumentSeriesCommand = {
  actorUserId: "2e2403ad-a266-4ffc-8680-b744f241001e",
  organizationId,
  companyId: companyIdValue,
  invoiceId: "invoice",
  sourceUpdatedAt: "2026-10-01T09:00:00.000Z",
  idempotencyKey: "issue-0001",
  documentSeriesScope: { kind: "branch", organizationId, companyId: companyIdValue, branchId },
  documentSeriesSelection: { kind: "explicit", seriesId },
  companyBranchId: branchId,
  allowNegativeStock: false,
  taxScope,
  fiscalDocumentDraft: draft,
  fiscalIssueDate: "2026-10-01",
  issuedAt,
  factMetadata,
};

test("normalizes the immutable issuance command before entering its transaction port", async () => {
  let received: IssueSalesInvoiceWithDocumentSeriesCommand | undefined;
  const repository: SalesInvoiceDocumentSeriesIssuanceRepository = {
    async issue(value) {
      received = value;
      const fact = fiscalDocumentTaxFactForSalesSeriesIssue(value.fiscalDocumentDraft, value.taxScope, value.factMetadata, value.fiscalIssueDate);
      return { invoiceId: value.invoiceId, companyId: companyId(value.companyId), status: "confirmed", seriesId, displayNumber: "FAC-00000001", number: 1, replayed: false, fiscalDocument: value.fiscalDocumentDraft.issue({ number: "FAC-00000001", issuedAt, issueDate: "2026-10-01", evidence: null }), taxFact: fact };
    },
  };
  const result = await new IssueSalesInvoiceWithDocumentSeries(repository).issue({
    ...command,
    invoiceId: " invoice ",
    idempotencyKey: " issue-0001 ",
    priceListId: " default ",
  });
  assert.equal(result.displayNumber, "FAC-00000001");
  assert.equal(received?.invoiceId, "invoice");
  assert.equal(received?.idempotencyKey, "issue-0001");
  assert.equal(received?.priceListId, "default");
  assert.notEqual(received, command);
});

test("rejects a branch scope that does not match the branch attribution before persistence", () => {
  let calls = 0;
  const repository = { async issue() { calls++; throw new Error("must not execute"); } } as unknown as SalesInvoiceDocumentSeriesIssuanceRepository;
  const service = new IssueSalesInvoiceWithDocumentSeries(repository);
  assert.throws(
    () => service.issue({ ...command, companyBranchId: "7a80cb00-d5d3-4a61-a34f-73d0c81a2345" }),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_DOCUMENT_SERIES_SELECTION_INVALID",
  );
  assert.equal(calls, 0);
});

test("rejects a company scope carrying a branch field and incompatible branch/register attribution", () => {
  let calls = 0;
  const repository = { async issue() { calls++; throw new Error("must not execute"); } } as unknown as SalesInvoiceDocumentSeriesIssuanceRepository;
  const service = new IssueSalesInvoiceWithDocumentSeries(repository);
  assert.throws(
    () => service.issue({ ...command, documentSeriesScope: { kind: "company", organizationId, companyId: companyIdValue, branchId } as unknown as IssueSalesInvoiceWithDocumentSeriesCommand["documentSeriesScope"] }),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_DOCUMENT_SERIES_SELECTION_INVALID",
  );
  assert.throws(
    () => service.issue({ ...command, salesRegisterId: "register", companyBranchId: branchId }),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_DOCUMENT_SERIES_INVALID",
  );
  assert.equal(calls, 0);
});

test("rejects malformed idempotency keys and explicit series identifiers before persistence", () => {
  let calls = 0;
  const repository = { async issue() { calls++; throw new Error("must not execute"); } } as unknown as SalesInvoiceDocumentSeriesIssuanceRepository;
  const service = new IssueSalesInvoiceWithDocumentSeries(repository);
  assert.throws(() => service.issue({ ...command, idempotencyKey: "short" }), SalesFailure);
  assert.throws(() => service.issue({ ...command, documentSeriesSelection: { kind: "explicit", seriesId: "not-a-uuid" } }), SalesFailure);
  assert.equal(calls, 0);
});

test("maps invalid reporting evidence to the sales failure contract before persistence", () => {
  let calls = 0;
  const repository = { async issue() { calls++; throw new Error("must not execute"); } } as unknown as SalesInvoiceDocumentSeriesIssuanceRepository;
  assert.throws(
    () => new IssueSalesInvoiceWithDocumentSeries(repository).issue({ ...command, factMetadata: { ...factMetadata, recognitionDate: "not-a-date" } }),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_FISCAL_PREPARATION_INVALID",
  );
  assert.equal(calls, 0);
});
