import assert from "node:assert/strict";
import test from "node:test";
import { organizationId, userId } from "@kontave/organizations/domain";
import {
  SupabaseCompanyRepository,
  type CompanySourceResponse,
  type CompanySupabaseSource,
} from "../../src/adapters/supabase";
import { CompanyCountry, CompanyFailure, CompanyStatus, companyId } from "../../src/domain";
import { currency } from "@kontave/monetary/domain";

const organization = organizationId("organization-a");
const legacyRow = { id: "legacy-company", organization_id: "organization-a", name: "Legacy CA", rif: "J-29767818-2", operating_profile: "standard" };
const currentRow = { ...legacyRow, trade_name: "Current", country: "VE", status: "suspended", person_nature: null, version: 3 };

test("direct reads rehydrate a fully legacy row with safe administrative defaults", async () => {
  const repository = new SupabaseCompanyRepository(source({ data: [legacyRow], error: null }));
  const [company] = await repository.listByOrganization(organization);
  assert.equal(company?.status, "active");
  assert.equal(company?.version, 1);
  assert.equal(company?.tradeName, null);
});

test("direct legacy reads preserve an existing HTTPS logo URL before administrative columns are migrated", async () => {
  const logoUrl = "https://legacy.example.com/logos/legacy-company.png";
  const repository = new SupabaseCompanyRepository(source({ data: [{ ...legacyRow, logo_url: logoUrl }], error: null }));
  const [company] = await repository.listByOrganization(organization);
  assert.equal(company?.logoUrl, logoUrl);
});

test("direct reads reject partially migrated company rows", async () => {
  const repository = new SupabaseCompanyRepository(source({ data: [{ ...legacyRow, status: "active" }], error: null }));
  await assert.rejects(() => repository.listByOrganization(organization), repositoryUnavailable);
});

test("strict current rows preserve lifecycle and version", async () => {
  const repository = new SupabaseCompanyRepository(source({ data: currentRow, error: null }));
  const company = await repository.findById(organization, companyId("legacy-company"));
  assert.equal(company?.status, "suspended");
  assert.equal(company?.version, 3);
  assert.equal(company?.tradeName, "Current");
});

test("administrative RPC responses reject legacy or malformed rows", async () => {
  const repository = new SupabaseCompanyRepository(source({ data: legacyRow, error: null }));
  await assert.rejects(() => repository.setStatus({ actorUserId: userId("actor"), organizationId: organization, companyId: companyId("legacy-company"), expectedVersion: 1 }, CompanyStatus.Suspended), repositoryUnavailable);
});

test("company creation requires an explicit nature and uses the additive creation RPC", async () => {
  const calls: Array<{ readonly name: string; readonly args: Record<string, unknown> }> = [];
  const repository = new SupabaseCompanyRepository({
    async listByOrganization() { return { data: [], error: null }; },
    async findById() { return { data: null, error: null }; },
    async save() { return { data: null, error: null }; },
    async rpc(name, args) { calls.push({ name, args }); return { data: { ...currentRow, id: "company-new", person_nature: "juridical", version: 1 }, error: null }; },
  });
  const company = await repository.create({ actorUserId: userId("actor"), organizationId: organization, idempotencyKey: "create-1", legalName: "Company New", tradeName: null, taxId: null, country: CompanyCountry.Venezuela, operatingProfile: "standard", personNature: "juridical" });
  assert.equal(company.personNature, "juridical");
  assert.equal(calls[0]?.name, "create_native_company_with_person_nature");
  assert.equal(calls[0]?.args.p_person_nature, "juridical");
});

test("person-nature adapter maps the scoped versioned RPC response", async () => {
  const calls: Array<{ readonly name: string; readonly args: Record<string, unknown> }> = [];
  const repository = new SupabaseCompanyRepository({
    async listByOrganization() { return { data: [], error: null }; },
    async findById() { return { data: null, error: null }; },
    async save() { return { data: null, error: null }; },
    async rpc(name, args) { calls.push({ name, args }); return { data: { ...currentRow, person_nature: "natural", version: 4 }, error: null }; },
  });
  const changed = await repository.setPersonNature({ actorUserId: userId("actor"), organizationId: organization, companyId: companyId("legacy-company"), expectedVersion: 3, personNature: "natural" });
  assert.equal(changed.personNature, "natural");
  assert.deepEqual(calls[0], { name: "set_native_company_person_nature", args: {
    p_actor_user_id: "actor", p_organization_id: "organization-a", p_company_id: "legacy-company",
    p_expected_version: 3, p_person_nature: "natural",
  } });
});

test("numbering administration uses the atomic company-scoped RPC contract", async () => {
  const calls: Array<{ readonly name: string; readonly args: Record<string, unknown> }> = [];
  const repository = new SupabaseCompanyRepository({
    async listByOrganization() { return { data: [], error: null }; },
    async findById() { return { data: currentRow, error: null }; },
    async save() { return { data: null, error: null }; },
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: { sales_invoice_next_number: 9, delivery_note_next_number: 4, company_version: 5 }, error: null };
    },
  });
  const scope = { actorUserId: userId("actor"), organizationId: organization, companyId: companyId("legacy-company"), expectedVersion: 4 };
  const current = await repository.getDocumentNumberingSettings(scope);
  assert.deepEqual(current, { salesInvoiceNextNumber: 9, deliveryNoteNextNumber: 4, companyVersion: 5 });
  const updated = await repository.updateDocumentNumberingSettings({ ...scope, deliveryNoteNextNumber: 8 });
  assert.deepEqual(updated, current);
  assert.deepEqual(calls.map(({ name }) => name), ["get_native_company_document_numbering", "update_native_company_document_numbering"]);
  assert.equal(calls[1]?.args.p_delivery_note_next_number, 8);
  assert.equal(calls[1]?.args.p_sales_invoice_next_number, null);
});

test("monetary policy adapter uses camel-case policy input and decodes the immutable snake-case row", async () => {
  const calls: Array<{ readonly name: string; readonly args: Record<string, unknown> }> = [];
  const monetaryRow = { organization_id: "organization-a", company_id: "legacy-company", policy_version: 1, operating_currency_code: "VES", operating_currency_minor_unit: 2, reference_currency_codes: ["USD"], rate_source: "bcv", rounding_profile: "commercial_v1", allow_previous_available_date: false, max_previous_days: 0, configured_at: "2026-09-28T00:00:00.000Z", configured_by: "actor" };
  const repository = new SupabaseCompanyRepository({
    async listByOrganization() { return { data: [], error: null }; }, async findById() { return { data: null, error: null }; }, async save() { return { data: null, error: null }; },
    async rpc(name, args) { calls.push({ name, args }); return { data: monetaryRow, error: null }; },
  });
  const result = await repository.configure({ actorUserId: userId("actor"), organizationId: organization, companyId: companyId("legacy-company"), expectedPolicyVersion: 0, idempotencyKey: "policy-1", reason: "Initial policy", settings: { operatingCurrencyCode: currency("VES", 2).code, operatingCurrencyMinorUnit: 2, referenceCurrencyCodes: [currency("USD", 2).code], rateSource: "bcv", roundingProfile: "commercial_v1", allowPreviousAvailableDate: false, maxPreviousDays: 0 } });
  assert.equal(result.version, 1);
  assert.deepEqual(calls[0]?.args.p_policy, { operatingCurrency: { code: "VES", minorUnit: 2 }, referenceCurrencyCodes: ["USD"], rateSource: "bcv", roundingProfile: "commercial_v1", allowPreviousAvailableDate: false, maxPreviousDays: 0 });
});

test("date format adapter maps camel-case commands to the immutable snake-case RPC contract", async () => {
  const calls: Array<{ readonly name: string; readonly args: Record<string, unknown> }> = [];
  const dateFormatRow = { organization_id: "organization-a", company_id: "legacy-company", format_version: 1, date_order: "day_first", configured_at: "2026-09-28T00:00:00.000Z", configured_by: "actor" };
  const repository = new SupabaseCompanyRepository({
    async listByOrganization() { return { data: [], error: null }; }, async findById() { return { data: null, error: null }; }, async save() { return { data: null, error: null }; },
    async rpc(name, args) { calls.push({ name, args }); return { data: dateFormatRow, error: null }; },
  });
  const command = { actorUserId: userId("actor"), organizationId: organization, companyId: companyId("legacy-company"), expectedFormatVersion: 0, idempotencyKey: "date-1", reason: "Initial date convention", dateOrder: "day_first" as const };
  const result = await repository.configureDateFormat(command);
  assert.equal(result.dateOrder, "day_first");
  assert.deepEqual(calls[0], { name: "configure_native_company_date_format", args: {
    p_actor_user_id: "actor", p_organization_id: "organization-a", p_company_id: "legacy-company", p_expected_format_version: 0,
    p_idempotency_key: "date-1", p_reason: "Initial date convention", p_date_order: "day_first",
  } });
  await repository.getDateFormat({ actorUserId: userId("actor"), organizationId: organization, companyId: companyId("legacy-company"), formatVersion: 1 });
  assert.deepEqual(calls[1]?.args, { p_actor_user_id: "actor", p_organization_id: "organization-a", p_company_id: "legacy-company", p_format_version: 1 });
});

test("configuration-copy adapter invokes one atomic RPC and rejects malformed receipts", async () => {
  const calls: Array<{ readonly name: string; readonly args: Record<string, unknown> }> = [];
  const repository = new SupabaseCompanyRepository({
    async listByOrganization() { return { data: [], error: null }; }, async findById() { return { data: null, error: null }; }, async save() { return { data: null, error: null }; },
    async rpc(name, args) { calls.push({ name, args }); return { data: { company: { ...currentRow, id: "destination-company", version: 4 }, copied_sections: ["operating_profile", "date_format"] }, error: null }; },
  });
  const result = await repository.copyToExisting({
    actorUserId: userId("actor"), organizationId: organization, sourceCompanyId: companyId("source-company"), expectedSourceCompanyVersion: 3,
    destinationCompanyId: companyId("destination-company"), expectedDestinationCompanyVersion: 3,
    selection: { sections: ["operating_profile", "date_format"], expectedSourceDateFormatVersion: 1 }, expectedDestinationDateFormatVersion: 0, idempotencyKey: "copy-1",
  });
  assert.equal(result.company.id, "destination-company");
  assert.deepEqual(result.copiedSections, ["operating_profile", "date_format"]);
  assert.equal(calls[0]?.name, "copy_native_company_configuration");
  assert.equal(calls[0]?.args.p_expected_destination_date_format_version, 0);
  const malformed = new SupabaseCompanyRepository(source({ data: { company: currentRow, copied_sections: ["untyped"] }, error: null }));
  await assert.rejects(() => malformed.copyToExisting({
    actorUserId: userId("actor"), organizationId: organization, sourceCompanyId: companyId("source-company"), expectedSourceCompanyVersion: 3,
    destinationCompanyId: companyId("destination-company"), expectedDestinationCompanyVersion: 3,
    selection: { sections: ["operating_profile"] }, idempotencyKey: "copy-malformed",
  }), repositoryUnavailable);
  await assert.rejects(() => repository.copyToExisting({
    actorUserId: userId("actor"), organizationId: organization, sourceCompanyId: companyId("source-company"), expectedSourceCompanyVersion: 3,
    destinationCompanyId: companyId("destination-company"), expectedDestinationCompanyVersion: 3,
    selection: { sections: ["fiscal_profile"] }, idempotencyKey: "copy-fiscal-unavailable",
  }), repositoryUnavailable);
  assert.equal(calls.length, 1, "unsupported fiscal copy must never reach the old RPC");
});

test("logo adapter maps a trusted URL through its dedicated atomic RPC", async () => {
  const calls: Array<{ readonly name: string; readonly args: Record<string, unknown> }> = [];
  const repository = new SupabaseCompanyRepository({
    async listByOrganization() { return { data: [], error: null }; }, async findById() { return { data: null, error: null }; }, async save() { return { data: null, error: null }; },
    async rpc(name, args) { calls.push({ name, args }); return { data: { ...currentRow, logo_url: "https://project.supabase.co/storage/v1/object/public/company-logos/organization-a/6c65676163792d636f6d70616e79/11111111-1111-4111-8111-111111111111.png", version: 4 }, error: null }; },
  });
  const changed = await repository.updateLogo({ actorUserId: userId("actor"), organizationId: organization, companyId: companyId("legacy-company"), expectedVersion: 3, logoUrl: "https://project.supabase.co/storage/v1/object/public/company-logos/organization-a/6c65676163792d636f6d70616e79/11111111-1111-4111-8111-111111111111.png" });
  assert.equal(changed.logoUrl, "https://project.supabase.co/storage/v1/object/public/company-logos/organization-a/6c65676163792d636f6d70616e79/11111111-1111-4111-8111-111111111111.png");
  assert.deepEqual(calls[0], { name: "update_native_company_logo", args: {
    p_actor_user_id: "actor", p_organization_id: "organization-a", p_company_id: "legacy-company", p_expected_version: 3,
    p_logo_url: "https://project.supabase.co/storage/v1/object/public/company-logos/organization-a/6c65676163792d636f6d70616e79/11111111-1111-4111-8111-111111111111.png",
  } });
});

test("source RPC errors map to typed repository failures", async () => {
  const repository = new SupabaseCompanyRepository(source({ data: null, error: { message: "network disconnected" } }));
  await assert.rejects(() => repository.findById(organization, companyId("legacy-company")), repositoryUnavailable);
});

test("source promise rejections map to typed repository failures", async () => {
  const repository = new SupabaseCompanyRepository({
    async listByOrganization() { throw new Error("connection lost"); },
    async findById() { throw new Error("connection lost"); },
    async save() { throw new Error("connection lost"); },
    async rpc() { throw new Error("connection lost"); },
  });
  await assert.rejects(() => repository.listByOrganization(organization), repositoryUnavailable);
});

test("legacy save distinguishes a zero-row optimistic update from absence", async () => {
  const repository = new SupabaseCompanyRepository({
    async listByOrganization() { return { data: [], error: null }; },
    async findById() { return { data: currentRow, error: null }; },
    async save() { return { data: null, error: null }; },
    async rpc() { return { data: null, error: null }; },
  });
  const company = (await repository.findById(organization, companyId("legacy-company")))!;
  await assert.rejects(() => repository.save(company), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_VERSION_CONFLICT");
});

test("legacy save rejects a non-row response even when it is non-null", async () => {
  const repository = new SupabaseCompanyRepository({
    async listByOrganization() { return { data: [], error: null }; },
    async findById() { return { data: currentRow, error: null }; },
    async save() { return { data: {}, error: null }; },
    async rpc() { return { data: null, error: null }; },
  });
  const company = (await repository.findById(organization, companyId("legacy-company")))!;
  await assert.rejects(() => repository.save(company), repositoryUnavailable);
});

function source(result: CompanySourceResponse): CompanySupabaseSource {
  return {
    async listByOrganization() { return result; },
    async findById() { return result; },
    async save() { return result; },
    async rpc() { return result; },
  };
}

function repositoryUnavailable(error: unknown): boolean {
  return error instanceof CompanyFailure && error.code === "COMPANY_REPOSITORY_UNAVAILABLE";
}
