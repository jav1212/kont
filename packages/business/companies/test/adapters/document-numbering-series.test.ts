import assert from "node:assert/strict";
import test from "node:test";
import { organizationId, userId } from "@kontave/organizations/domain";
import {
  SupabaseCompanyDocumentSeriesConfigurationRepository,
  type CompanySourceResponse,
  type CompanySupabaseSource,
} from "../../src/adapters/supabase";
import { CompanyFailure, companyId } from "../../src/domain";

const organization = organizationId("11111111-1111-4111-8111-111111111111");
const actor = userId("22222222-2222-4222-8222-222222222222");
const company = companyId("company-a");
const series = {
  id: "33333333-3333-4333-8333-333333333333",
  scope: { kind: "company" as const, organizationId: organization, companyId: company },
  documentType: "sales_invoice", code: "FAC", prefix: "FAC-", nextNumber: 1, maximumNumber: 1000, active: true, version: 1,
};

test("series configuration adapter maps a company-scoped creation into the service RPC", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const repository = new SupabaseCompanyDocumentSeriesConfigurationRepository(source({ data: series, error: null }, calls));
  const saved = await repository.createSeries({
    actorUserId: actor, organizationId: organization, companyId: company, idempotencyKey: "series-create-1",
    scope: series.scope, documentType: "sales_invoice", code: "FAC", prefix: "FAC-", nextNumber: 1, maximumNumber: 1000,
  });
  assert.deepEqual(saved, series);
  assert.deepEqual(calls[0], { name: "create_native_company_document_series", args: {
    p_actor_user_id: actor, p_organization_id: organization, p_company_id: company, p_idempotency_key: "series-create-1",
    p_scope_kind: "company", p_branch_id: null, p_document_type: "sales_invoice", p_code: "FAC", p_prefix: "FAC-", p_next_number: 1, p_maximum_number: 1000,
  } });
});

test("series configuration adapter preserves a branch scope and optional type list filter", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const branchId = "44444444-4444-4444-8444-444444444444";
  const branchSeries = { ...series, id: "55555555-5555-4555-8555-555555555555", scope: { kind: "branch" as const, organizationId: organization, companyId: company, branchId } };
  const repository = new SupabaseCompanyDocumentSeriesConfigurationRepository(source({ data: [branchSeries], error: null }, calls));
  const values = await repository.listSeries({ actorUserId: actor, organizationId: organization, companyId: company, scope: branchSeries.scope });
  assert.deepEqual(values, [branchSeries]);
  assert.deepEqual(calls[0], { name: "list_native_company_document_series", args: {
    p_actor_user_id: actor, p_organization_id: organization, p_company_id: company, p_scope_kind: "branch", p_branch_id: branchId, p_document_type: null,
  } });
});

test("selection-rule configuration maps compare-and-swap and policy fields", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rule = { scope: series.scope, documentType: "sales_invoice", policy: "company_default" as const, defaultSeriesId: series.id, version: 1 };
  const repository = new SupabaseCompanyDocumentSeriesConfigurationRepository(source({ data: rule, error: null }, calls));
  const saved = await repository.configureSelectionRule({
    actorUserId: actor, organizationId: organization, companyId: company, idempotencyKey: "rule-1", scope: series.scope,
    documentType: "sales_invoice", expectedVersion: 0, policy: "company_default", defaultSeriesId: series.id,
  });
  assert.deepEqual(saved, rule);
  assert.equal(calls[0]?.name, "configure_native_company_document_series_selection_rule");
  assert.equal(calls[0]?.args.p_expected_version, 0);
  assert.equal(calls[0]?.args.p_default_series_id, series.id);
});

test("adapter rejects malformed rows and maps expected RPC concurrency failures", async () => {
  const malformed = new SupabaseCompanyDocumentSeriesConfigurationRepository(source({ data: { ...series, maximumNumber: "1000" }, error: null }));
  await assert.rejects(() => malformed.createSeries({
    actorUserId: actor, organizationId: organization, companyId: company, idempotencyKey: "malformed", scope: series.scope,
    documentType: "sales_invoice", code: "FAC", prefix: null, nextNumber: 1, maximumNumber: 1000,
  }), repositoryUnavailable);
  const conflict = new SupabaseCompanyDocumentSeriesConfigurationRepository(source({ data: null, error: { message: "COMPANY_DOCUMENT_SERIES_VERSION_CONFLICT" } }));
  await assert.rejects(() => conflict.configureSelectionRule({
    actorUserId: actor, organizationId: organization, companyId: company, idempotencyKey: "conflict", scope: series.scope,
    documentType: "sales_invoice", expectedVersion: 1, policy: "company_default", defaultSeriesId: series.id,
  }), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_DOCUMENT_SERIES_VERSION_CONFLICT");
});

function source(result: CompanySourceResponse, calls?: Array<{ name: string; args: Record<string, unknown> }>): CompanySupabaseSource {
  return {
    async listByOrganization() { return result; }, async findById() { return result; }, async save() { return result; },
    async rpc(name, args) { calls?.push({ name, args }); return result; },
  };
}

function repositoryUnavailable(error: unknown): boolean {
  return error instanceof CompanyFailure && error.code === "COMPANY_REPOSITORY_UNAVAILABLE";
}
