import assert from "node:assert/strict";
import test from "node:test";
import { organizationId, userId } from "@kontave/organizations/domain";
import { SupabaseCompanyFiscalProfileRepository, type CompanySourceResponse, type CompanySupabaseSource } from "../../src/adapters/supabase";
import { companyId } from "../../src/domain";

const scope = {
  actorUserId: userId("8af98c56-5ed7-4e2b-a585-61fbdf6ace00"),
  organizationId: organizationId("f502adce-4f15-4ea3-9f33-e6882a8f1100"),
  companyId: companyId("company-1"),
};
const row = {
  companyId: scope.companyId, legalName: "Empresa Antigua CA", taxId: "J29767818-2",
  personNature: null, fiscalAddress: "Avenida Principal", taxpayerType: "ordinario", companyVersion: 7,
};

test("fiscal profile adapter uses the scoped RPC contract and preserves a legacy opaque RIF", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const source: CompanySupabaseSource = sourceWith(async (name, args) => {
    calls.push({ name, args });
    return { data: name.startsWith("configure") ? { ...row, fiscalAddress: null, taxpayerType: "especial", companyVersion: 8 } : row, error: null };
  });
  const repository = new SupabaseCompanyFiscalProfileRepository(source);
  assert.equal((await repository.get(scope)).taxId, "J29767818-2");
  const saved = await repository.configure({ ...scope, expectedCompanyVersion: 7, idempotencyKey: "fiscal-1", reason: "Clear address", fiscalAddress: null, taxpayerType: "especial" });
  assert.equal(saved.companyVersion, 8);
  assert.deepEqual(calls.map((call) => call.name), ["get_native_company_fiscal_profile", "configure_native_company_fiscal_profile"]);
  assert.deepEqual(calls[1]?.args, {
    p_actor_user_id: scope.actorUserId, p_organization_id: scope.organizationId, p_company_id: scope.companyId,
    p_expected_version: 7, p_idempotency_key: "fiscal-1", p_reason: "Clear address",
    p_fiscal_address: null, p_taxpayer_type: "especial",
  });
});

test("fiscal profile adapter maps typed RPC failures and refuses malformed or wrong-scope payloads", async () => {
  const rawDatabaseDetail = "COMPANY_FISCAL_PROFILE_IDEMPOTENCY_CONFLICT: receipt 1b2c database detail";
  const conflict = new SupabaseCompanyFiscalProfileRepository(sourceWith(async () => ({ data: null, error: { message: rawDatabaseDetail } })));
  await assert.rejects(
    () => conflict.configure({ ...scope, expectedCompanyVersion: 7, idempotencyKey: "fiscal-1", reason: "Reason", fiscalAddress: null, taxpayerType: "especial" }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "COMPANY_FISCAL_PROFILE_IDEMPOTENCY_CONFLICT" && !error.message.includes(rawDatabaseDetail),
  );
  const malformed = new SupabaseCompanyFiscalProfileRepository(sourceWith(async () => ({ data: { ...row, taxpayerType: "unknown" }, error: null })));
  await assert.rejects(() => malformed.get(scope), { code: "COMPANY_REPOSITORY_UNAVAILABLE" });
});

function sourceWith(rpc: CompanySupabaseSource["rpc"]): CompanySupabaseSource {
  return {
    async listByOrganization(): Promise<CompanySourceResponse> { return { data: [], error: null }; },
    async findById(): Promise<CompanySourceResponse> { return { data: null, error: null }; },
    async save(): Promise<CompanySourceResponse> { return { data: null, error: null }; },
    rpc,
  };
}
