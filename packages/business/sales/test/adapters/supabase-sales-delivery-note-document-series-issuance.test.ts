import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyId } from "@kontave/companies/domain";
import type { OrganizationId } from "@kontave/organizations/domain";
import { SupabaseSalesDeliveryNoteDocumentSeriesIssuanceRepository } from "../../src/adapters/supabase";
import type { IssueSalesDeliveryNoteWithDocumentSeriesCommand } from "../../src/application";
import { SalesFailure } from "../../src/domain";

const organizationId = "8e2403ad-a266-4ffc-8680-b744f241001e" as OrganizationId;
const companyId = "company" as CompanyId;
const branchId = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const seriesId = "7be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const command: IssueSalesDeliveryNoteWithDocumentSeriesCommand = {
  actorUserId: "2e2403ad-a266-4ffc-8680-b744f241001e", organizationId, companyId, deliveryNoteId: "delivery-draft",
  idempotencyKey: "delivery-0001", documentSeriesScope: { kind: "branch", organizationId, companyId, branchId },
  documentSeriesSelection: { kind: "explicit", seriesId }, companyBranchId: branchId, allowNegativeStock: false,
};
const response = (replayed = false) => ({ deliveryNoteId: "delivery-draft", companyId: "company", status: "confirmed" as const, seriesId, displayNumber: "NE-00000001", number: 1, replayed });

test("the Supabase adapter sends only commercial delivery-note issuance arguments to its fixed RPC", async () => {
  let name = "";
  let args: Record<string, unknown> | undefined;
  const client = { rpc: async (rpcName: string, rpcArgs: Record<string, unknown>) => { name = rpcName; args = rpcArgs; return { data: response(), error: null }; } } as unknown as SupabaseClient;
  const result = await new SupabaseSalesDeliveryNoteDocumentSeriesIssuanceRepository(client).issue(command);
  assert.equal(name, "confirm_native_sales_delivery_note_with_document_series_secure");
  assert.equal(args?.p_scope_kind, "branch");
  assert.equal(args?.p_scope_branch_id, branchId);
  assert.equal(args?.p_selection_kind, "explicit");
  assert.equal(args?.p_series_id, seriesId);
  assert.equal(args?.p_company_branch_id, branchId);
  assert.equal("p_fact_snapshot" in (args ?? {}), false);
  assert.equal("p_fiscal_document_snapshot" in (args ?? {}), false);
  assert.equal(result.replayed, false);
});

test("the Supabase adapter maps expected RPC errors and rejects a mismatched durable scope", async () => {
  for (const code of ["SALES_DOCUMENT_SERIES_EXHAUSTED", "SALES_DOCUMENT_SERIES_SELECTION_INVALID", "SALES_DOCUMENT_SERIES_IDEMPOTENCY_CONFLICT"] as const) {
    const rejected = { rpc: async () => ({ data: null, error: { message: code } }) } as unknown as SupabaseClient;
    await assert.rejects(new SupabaseSalesDeliveryNoteDocumentSeriesIssuanceRepository(rejected).issue(command), (error: unknown) => error instanceof SalesFailure && error.code === code);
  }
  const invalid = { rpc: async () => ({ data: { ...response(), companyId: "other" }, error: null }) } as unknown as SupabaseClient;
  await assert.rejects(new SupabaseSalesDeliveryNoteDocumentSeriesIssuanceRepository(invalid).issue(command), (error: unknown) => error instanceof SalesFailure && error.code === "SALES_REPOSITORY_UNAVAILABLE");
});

test("the Supabase adapter sends null branch and series identifiers for a company policy and preserves replay shape", async () => {
  let args: Record<string, unknown> | undefined;
  const client = { rpc: async (_name: string, rpcArgs: Record<string, unknown>) => { args = rpcArgs; return { data: response(true), error: null }; } } as unknown as SupabaseClient;
  const result = await new SupabaseSalesDeliveryNoteDocumentSeriesIssuanceRepository(client).issue({ ...command, documentSeriesScope: { kind: "company", organizationId, companyId }, documentSeriesSelection: { kind: "policy" }, companyBranchId: null });
  assert.equal(args?.p_scope_branch_id, null);
  assert.equal(args?.p_series_id, null);
  assert.equal(args?.p_selection_kind, "policy");
  assert.equal(result.replayed, true);
});
