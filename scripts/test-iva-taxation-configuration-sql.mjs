/**
 * Exercises IVA configuration migration 321 in a disposable embedded PostgreSQL database.
 * Set PGLITE_MODULE_PATH when PGlite is installed outside the repository; this never connects to Supabase.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const database = new PGlite();
const tenantId = "00000000-0000-4000-8000-000000000001";
const organizationId = "00000000-0000-4000-8000-000000000002";
const actorId = "00000000-0000-4000-8000-000000000003";
const companyId = "J-12345678-9";

function rule(id, component = "base") {
  return {
    id,
    taxCode: "IVA",
    jurisdiction: "VE",
    treatment: "taxed",
    rate: "16",
    calculationMode: "tax_exclusive",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    legalBasis: "Ley IVA 2020, artículo 63; verificar decreto posterior",
    version: `v-${id}`,
    category: "general",
    legacyRateSlot: "a1",
    component,
  };
}

async function saveCatalog(idempotencyKey, rules, expectedVersion = 0) {
  const result = await database.query(
    `select public.save_native_company_tax_rule_catalog($1,$2,$3,$4,$5,$6::jsonb) as result`,
    [actorId, organizationId, companyId, expectedVersion, idempotencyKey, JSON.stringify(rules)],
  );
  return result.rows[0].result;
}

async function saveCounterparty(input) {
  const result = await database.query(
    `select public.save_native_tax_counterparty_profile($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as result`,
    [actorId, organizationId, companyId, input.counterpartyId, input.contributorStatus, input.residenceStatus,
      input.effectiveFrom, input.effectiveTo, input.legalBasis, input.evidenceReference, input.expectedVersion, input.idempotencyKey],
  );
  return result.rows[0].result;
}

async function expectDatabaseError(operation, code) {
  await assert.rejects(operation, (error) => String(error.message).includes(code));
}

try {
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.tenants(id uuid primary key);
    create table public.organizations(id uuid primary key);
    create table public.shared_companies(tenant_id uuid not null, id text not null, organization_id uuid not null, primary key(tenant_id,id));
    create table public.shared_tax_rules(id text not null, tax_code text not null, jurisdiction text not null, treatment text not null, rate numeric not null, calculation_mode text not null, effective_from date not null, effective_to date, legal_basis text not null, version text not null);
    create table public.shared_product_tax_profiles(id text, tenant_id uuid, company_id text, product_id text, jurisdiction text, version integer);
    create table public.shared_product_tax_assignments(tenant_id uuid, profile_id text, tax_code text, treatment text, effective_from date, effective_to date, legal_basis text, classification_version text);
    create table public.shared_service_tax_profiles(id text, tenant_id uuid, company_id text, service_code text, fiscal_unit_code text, jurisdiction text, version integer);
    create table public.shared_service_tax_assignments(tenant_id uuid, profile_id text, tax_code text, treatment text, effective_from date, effective_to date, legal_basis text, classification_version text);
    insert into public.tenants values ('${tenantId}');
    insert into public.organizations values ('${organizationId}');
    insert into public.shared_companies values ('${tenantId}','${companyId}','${organizationId}');
    create function public.native_service_tax_assert_access(uuid,uuid,text) returns uuid language sql stable as $$
      select tenant_id from public.shared_companies where organization_id=$2 and id=$3 and $1='${actorId}'
    $$;
  `);

  await database.exec(await readFile(new URL("../supabase/migrations/321_iva_taxation_configuration.sql", import.meta.url), "utf8"));

  const first = await saveCatalog("catalog-command-001", [rule("iva-general")]);
  assert.equal(first.version, 1);
  assert.equal(first.rules[0].component, "base");
  const replay = await saveCatalog("catalog-command-001", [rule("iva-general")]);
  assert.deepEqual(replay, first);
  await expectDatabaseError(() => saveCatalog("catalog-command-001", [rule("iva-other")]), "TAXATION_IDEMPOTENCY_CONFLICT");
  const reducedRule = { ...rule("iva-reduced"), rate: "8", category: "reduced", legacyRateSlot: "a2", legalBasis: "Venezuela VAT Law 2020, article 64" };
  const paymentRule = { ...rule("iva-payment", "payment"), rate: "5", category: "payment_surcharge", legacyRateSlot: "a3", legalBasis: "Statutory lower bound only; not an active rate configuration" };
  const second = await saveCatalog("catalog-command-002", [rule("iva-general"), reducedRule, paymentRule], 1);
  assert.equal(second.version, 2);
  assert.equal(second.rules.find((item) => item.id === "iva-reduced")?.rate, "8.000000");
  assert.equal(second.rules.find((item) => item.id === "iva-reduced")?.category, "reduced");
  assert.equal(second.rules.find((item) => item.id === "iva-payment")?.component, "payment");
  assert.equal(second.rules.find((item) => item.id === "iva-payment")?.legacyRateSlot, "a3");
  await expectDatabaseError(() => saveCatalog("catalog-command-003", [rule("iva-stale")]), "TAXATION_VERSION_CONFLICT");

  const profileInput = {
    counterpartyId: "supplier-001", contributorStatus: "formal", residenceStatus: "domestic",
    effectiveFrom: "2026-01-01", effectiveTo: null, legalBasis: "Reviewed evidence",
    evidenceReference: "evidence-001", expectedVersion: 0, idempotencyKey: "supplier-command-001",
  };
  const profile = await saveCounterparty(profileInput);
  assert.equal(profile.version, 1);
  const profileReplay = await saveCounterparty(profileInput);
  assert.deepEqual(profileReplay, profile);
  await expectDatabaseError(() => saveCounterparty({ ...profileInput, residenceStatus: "foreign_service" }), "TAXATION_IDEMPOTENCY_CONFLICT");

  const counts = await database.query(`
    select (select count(*) from public.shared_company_tax_rules) as rules,
      (select count(*) from public.shared_tax_counterparty_profiles) as profiles,
      (select count(*) from public.shared_taxation_configuration_idempotency) as commands
  `);
    assert.deepEqual(counts.rows[0], { rules: 4, profiles: 1, commands: 3 });
  process.stdout.write("IVA taxation SQL migration passed: exact replay, payload conflict, and stale version checks.\n");
} finally {
  await database.close();
}
