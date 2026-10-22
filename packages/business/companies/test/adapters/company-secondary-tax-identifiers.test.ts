import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseCompanyRepository, type CompanySupabaseSource } from "../../src/adapters/supabase";
import type { CompanySourceResponse } from "../../src/adapters/supabase";
import { companyId } from "../../src/domain";
import { organizationId, userId } from "@kontave/organizations/domain";

const scope = {
  actorUserId: userId("8af98c56-5ed7-4e2b-a585-61fbdf6ace00"),
  organizationId: organizationId("f502adce-4f15-4ea3-9f33-e6882a8f1100"),
  companyId: companyId("company-1"),
};

const row = {
  id: "87c33431-9bc4-4985-b5ac-641d6b912e17",
  organization_id: scope.organizationId,
  company_id: scope.companyId,
  jurisdiction: "VE",
  scheme: "vat",
  identifier_value: "ABC-19",
  version: 2,
  created_at: "2026-09-29T10:00:00.000Z",
  updated_at: "2026-09-29T11:00:00.000Z",
};

test("secondary tax identifier adapter uses only scoped RPCs and preserves its independent revision", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const source: CompanySupabaseSource = {
    async listByOrganization(): Promise<CompanySourceResponse> { return { data: [], error: null }; },
    async findById(): Promise<CompanySourceResponse> { return { data: null, error: null }; },
    async save(): Promise<CompanySourceResponse> { return { data: null, error: null }; },
    async rpc(name, args): Promise<CompanySourceResponse> {
      calls.push({ name, args });
      if (name === "get_native_company_secondary_tax_identifiers") return { data: [row], error: null };
      if (name === "remove_native_company_secondary_tax_identifier") return { data: true, error: null };
      return { data: row, error: null };
    },
  };
  const repository = new SupabaseCompanyRepository(source);

  const identifiers = await repository.list(scope);
  assert.equal(identifiers[0]?.version, 2);
  assert.equal(identifiers[0]?.value, "ABC-19");
  const saved = await repository.set({ ...scope, jurisdiction: "VE", scheme: "vat", value: "NEXT-20", expectedVersion: 2 });
  assert.equal(saved.version, 2);
  await repository.remove({ ...scope, jurisdiction: "VE", scheme: "vat", expectedVersion: 2 });

  assert.deepEqual(calls.map((call) => call.name), [
    "get_native_company_secondary_tax_identifiers",
    "set_native_company_secondary_tax_identifier",
    "remove_native_company_secondary_tax_identifier",
  ]);
  assert.equal(calls[1]?.args.p_expected_version, 2);
  assert.equal(calls[1]?.args.p_identifier_value, "NEXT-20");
  assert.equal(calls[2]?.args.p_company_id, scope.companyId);
});

test("secondary tax identifier adapter rejects malformed responses and maps typed RPC errors", async () => {
  const malformed: CompanySupabaseSource = {
    async listByOrganization(): Promise<CompanySourceResponse> { return { data: [], error: null }; },
    async findById(): Promise<CompanySourceResponse> { return { data: null, error: null }; },
    async save(): Promise<CompanySourceResponse> { return { data: null, error: null }; },
    async rpc(): Promise<CompanySourceResponse> { return { data: [{ ...row, scheme: "invalid scheme" }], error: null }; },
  };
  await assert.rejects(() => new SupabaseCompanyRepository(malformed).list(scope), { code: "COMPANY_REPOSITORY_UNAVAILABLE" });

  const conflict: CompanySupabaseSource = {
    async listByOrganization(): Promise<CompanySourceResponse> { return { data: [], error: null }; },
    async findById(): Promise<CompanySourceResponse> { return { data: null, error: null }; },
    async save(): Promise<CompanySourceResponse> { return { data: null, error: null }; },
    async rpc(): Promise<CompanySourceResponse> { return { data: null, error: { message: "COMPANY_SECONDARY_TAX_IDENTIFIER_VERSION_CONFLICT" } }; },
  };
  await assert.rejects(() => new SupabaseCompanyRepository(conflict).set({
    ...scope, jurisdiction: "VE", scheme: "vat", value: "AB-1", expectedVersion: 0,
  }), { code: "COMPANY_SECONDARY_TAX_IDENTIFIER_VERSION_CONFLICT" });
});
