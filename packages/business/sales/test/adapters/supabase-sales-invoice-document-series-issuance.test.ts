import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseSalesInvoiceDocumentSeriesIssuanceRepository } from "../../src/adapters/supabase";
import type { IssueSalesInvoiceWithDocumentSeriesCommand } from "../../src/application";
import { SalesFailure } from "../../src/domain";
import type { OrganizationId } from "@kontave/organizations/domain";
import type { CompanyId } from "@kontave/companies/domain";
import { fiscalInvoiceFixture } from "@kontave/fiscal/testing";
import { encodeFiscalDocument } from "@kontave/fiscal/supabase";
import { fiscalDocumentTaxFactForSalesSeriesIssue } from "@kontave/tax-reporting/fiscal-document-mapper";
import type { FiscalDocumentFactMetadata } from "@kontave/tax-reporting/fiscal-document-mapper";
import type { TaxReportingScope } from "@kontave/tax-reporting/domain";

const organizationId = "8e2403ad-a266-4ffc-8680-b744f241001e" as OrganizationId;
const companyId = "company" as CompanyId;
const branchId = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const seriesId = "7be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const draft = fiscalInvoiceFixture({ companyId });
const taxScope: TaxReportingScope = { tenantId: "1e2403ad-a266-4ffc-8680-b744f241001e", organizationId, companyId };
const issuedAt = "2026-10-01T10:00:00.000Z";
const factMetadata: FiscalDocumentFactMetadata = { factId: "fact-1", lineageKey: "sale:invoice", recognitionDate: "2026-10-01", counterpartyCountryCode: "VE", withholding: null, affectedFactId: null, recordedAt: issuedAt };
const fact = fiscalDocumentTaxFactForSalesSeriesIssue(draft, taxScope, factMetadata, "2026-10-01");
const issuedDocument = draft.issue({ number: "FAC-00000001", issuedAt, issueDate: "2026-10-01", evidence: null });
const command: IssueSalesInvoiceWithDocumentSeriesCommand = {
  actorUserId: "2e2403ad-a266-4ffc-8680-b744f241001e", organizationId, companyId, invoiceId: "invoice", sourceUpdatedAt: "2026-10-01T09:00:00.000Z", idempotencyKey: "issue-0001",
  documentSeriesScope: { kind: "branch", organizationId, companyId, branchId },
  documentSeriesSelection: { kind: "explicit", seriesId }, companyBranchId: branchId, allowNegativeStock: false,
  taxScope, fiscalDocumentDraft: draft, fiscalIssueDate: "2026-10-01", issuedAt, factMetadata,
};

function response(replayed = false) {
  const encodedFact = JSON.stringify(fact, (_key, value: unknown) => typeof value === "bigint" ? value.toString() : value);
  return { issuance: { invoiceId: "invoice", companyId: "company", status: "confirmed", seriesId, displayNumber: "FAC-00000001", number: 1, replayed }, fiscalDocument: JSON.parse(encodeFiscalDocument(issuedDocument)), taxFact: JSON.parse(encodedFact), replayed };
}

test("the Supabase adapter sends every atomic issuance argument to the fixed RPC", async () => {
  let name = "";
  let args: Record<string, unknown> | undefined;
  const client = { rpc: async (rpcName: string, rpcArgs: Record<string, unknown>) => {
    name = rpcName;
    args = rpcArgs;
    return { data: response(), error: null };
  } } as unknown as SupabaseClient;
  const result = await new SupabaseSalesInvoiceDocumentSeriesIssuanceRepository(client).issue(command, fact);
  assert.equal(name, "confirm_native_sales_invoice_tax_issuance_secure");
  assert.equal(args?.p_scope_kind, "branch");
  assert.equal(args?.p_scope_branch_id, branchId);
  assert.equal(args?.p_selection_kind, "explicit");
  assert.equal(args?.p_series_id, seriesId);
  assert.equal(args?.p_company_branch_id, branchId);
  assert.equal(args?.p_tenant_id, taxScope.tenantId);
  assert.ok(args?.p_fact_snapshot);
  assert.ok(args?.p_fiscal_document_snapshot);
  assert.equal(result.replayed, false);
});

test("the Supabase adapter maps the document-series errors emitted by the atomic RPC", async () => {
  for (const code of [
    "SALES_DOCUMENT_SERIES_EXHAUSTED",
    "SALES_DOCUMENT_SERIES_SELECTION_INVALID",
    "SALES_DOCUMENT_SERIES_NUMBER_CONFLICT",
  ] as const) {
    const rejected = { rpc: async () => ({ data: null, error: { message: code } }) } as unknown as SupabaseClient;
    await assert.rejects(
      new SupabaseSalesInvoiceDocumentSeriesIssuanceRepository(rejected).issue(command, fact),
      (error: unknown) => error instanceof SalesFailure && error.code === code,
    );
  }
  const invalid = { rpc: async () => ({ data: { ...response(), issuance: { ...response().issuance, companyId: "other" } }, error: null }) } as unknown as SupabaseClient;
  await assert.rejects(
    new SupabaseSalesInvoiceDocumentSeriesIssuanceRepository(invalid).issue(command, fact),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_REPOSITORY_UNAVAILABLE",
  );
});

test("the Supabase adapter sends null branch and series identifiers for a company policy", async () => {
  let args: Record<string, unknown> | undefined;
  const client = { rpc: async (_name: string, rpcArgs: Record<string, unknown>) => {
    args = rpcArgs;
    return { data: response(true), error: null };
  } } as unknown as SupabaseClient;
  await new SupabaseSalesInvoiceDocumentSeriesIssuanceRepository(client).issue({
    ...command,
    documentSeriesScope: { kind: "company", organizationId, companyId },
    documentSeriesSelection: { kind: "policy" },
    companyBranchId: null,
  }, fact);
  assert.equal(args?.p_scope_branch_id, null);
  assert.equal(args?.p_series_id, null);
  assert.equal(args?.p_selection_kind, "policy");
});
