/**
 * Exercises the IVA company configuration migration (periodicity command and
 * product tax assignment summary) in disposable embedded PostgreSQL.
 * Set PGLITE_MODULE_PATH when PGlite is installed outside the repository.
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
const readerId = "00000000-0000-4000-8000-000000000004";
const companyId = "J-12345678-9";

/** @param {Promise<unknown>} operation @param {string} code @returns {Promise<void>} Expects a database error carrying the code. */
async function expectDatabaseError(operation, code) {
  await assert.rejects(operation, (error) => String(error.message).includes(code));
}

/** @param {object} input @returns {Promise<object>} Periodicity command result. */
async function setPeriodicity({ actor = actorId, periodicity, expected = null, reason = null, key }) {
  const result = await database.query(
    "select public.shared_tax_reporting_periodicity_set($1,$2,$3,$4,$5,$6,$7,$8) as result",
    [tenantId, organizationId, companyId, actor, periodicity, expected, reason, key],
  );
  return result.rows[0].result;
}

/** @param {string} actor @returns {Promise<object>} Periodicity read result. */
async function readPeriodicity(actor = actorId) {
  return (await database.query("select public.shared_tax_reporting_periodicity_read($1,$2,$3,$4) as result", [tenantId, organizationId, companyId, actor])).rows[0].result;
}

try {
  // Permission assertions mirror production: the reader only has companies.read.
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.shared_companies(tenant_id uuid not null, id text not null, organization_id uuid not null, iva_periodicity text, primary key(tenant_id,id));
    create table public.shared_tax_reporting_periods(tenant_id uuid not null, organization_id uuid not null, company_id text not null, period_key text not null, primary key(tenant_id,organization_id,company_id,period_key));
    create table public.test_permissions(user_id uuid not null, permission text not null);
    create function public.assert_user_security_access(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_permission text) returns uuid language plpgsql as $$
    begin
      perform 1 from public.shared_companies where organization_id=p_organization_id and id=p_company_id for share;
      if not exists(select 1 from public.test_permissions where user_id=p_actor_user_id and permission=p_permission) then raise exception 'ORGANIZATIONAL_USER_ACCESS_DENIED'; end if;
      return '${tenantId}';
    end $$;
    create function public.assert_user_security_read_access(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_permission text) returns uuid language plpgsql stable as $$
    begin
      if not exists(select 1 from public.test_permissions where user_id=p_actor_user_id and permission=p_permission) then raise exception 'ORGANIZATIONAL_USER_ACCESS_DENIED'; end if;
      return '${tenantId}';
    end $$;
    create table public.shared_inventory_products(tenant_id uuid not null, id text not null, company_id text not null, active boolean not null, vat_type text, primary key(tenant_id,id));
    create table public.shared_product_tax_profiles(tenant_id uuid not null, id text not null, company_id text not null, product_id text not null, primary key(tenant_id,id));
    create table public.shared_product_tax_assignments(tenant_id uuid not null, id text not null, profile_id text not null, tax_code text not null, treatment text not null, tax_category text, effective_from date not null, effective_to date, primary key(tenant_id,id));
    insert into public.shared_companies values ('${tenantId}','${companyId}','${organizationId}',null);
    insert into public.test_permissions values ('${actorId}','companies.update'),('${actorId}','companies.read'),('${readerId}','companies.read');
    insert into public.shared_inventory_products values
      ('${tenantId}','p-taxed','${companyId}',true,'general'),
      ('${tenantId}','p-exempt','${companyId}',true,'exento'),
      ('${tenantId}','p-mismatch','${companyId}',true,'general'),
      ('${tenantId}','p-unassigned','${companyId}',true,'general'),
      ('${tenantId}','p-inactive','${companyId}',false,'general'),
      ('${tenantId}','p-closed','${companyId}',true,'general');
    insert into public.shared_product_tax_profiles values
      ('${tenantId}','pr-taxed','${companyId}','p-taxed'),('${tenantId}','pr-exempt','${companyId}','p-exempt'),
      ('${tenantId}','pr-mismatch','${companyId}','p-mismatch'),('${tenantId}','pr-inactive','${companyId}','p-inactive'),
      ('${tenantId}','pr-closed','${companyId}','p-closed');
    insert into public.shared_product_tax_assignments values
      ('${tenantId}','a1','pr-taxed','IVA','taxed','general','2026-01-01',null),
      ('${tenantId}','a2','pr-exempt','IVA','exempt',null,'2026-01-01',null),
      ('${tenantId}','a3','pr-mismatch','IVA','exempt',null,'2026-01-01',null),
      ('${tenantId}','a4','pr-inactive','IVA','taxed','general','2026-01-01',null),
      ('${tenantId}','a5','pr-closed','IVA','taxed','general','2025-01-01','2025-12-31');
  `);
  await database.exec(await readFile(new URL("../supabase/migrations/20261023160325_iva_company_configuration.sql", import.meta.url), "utf8"));

  const initial = await readPeriodicity();
  assert.equal(initial.periodicity, null, "periodicity starts unconfigured and is never inferred");
  assert.equal(initial.persistedPeriods, 0);

  await expectDatabaseError(setPeriodicity({ actor: readerId, periodicity: "monthly", key: "reader-key" }), "ORGANIZATIONAL_USER_ACCESS_DENIED");
  await expectDatabaseError(setPeriodicity({ periodicity: "weekly", key: "bad-value" }), "TAX_REPORTING_INVALID");
  await expectDatabaseError(setPeriodicity({ periodicity: "monthly", expected: "fortnightly", key: "stale-key" }), "TAX_REPORTING_CONCURRENCY_CONFLICT");

  const first = await setPeriodicity({ periodicity: "monthly", key: "first-key" });
  assert.deepEqual(first, { periodicity: "monthly", replayed: false });
  assert.deepEqual(await setPeriodicity({ periodicity: "monthly", key: "first-key" }), { periodicity: "monthly", replayed: true }, "same command replays");
  await expectDatabaseError(setPeriodicity({ periodicity: "fortnightly", key: "first-key" }), "TAX_REPORTING_IDEMPOTENCY_CONFLICT");
  await expectDatabaseError(setPeriodicity({ periodicity: "monthly", expected: "monthly", reason: "x", key: "same-value" }), "TAX_REPORTING_INVALID");
  await expectDatabaseError(setPeriodicity({ periodicity: "fortnightly", expected: "monthly", key: "no-reason" }), "TAX_REPORTING_INVALID");

  const changed = await setPeriodicity({ periodicity: "fortnightly", expected: "monthly", reason: "Providencia de contribuyente especial", key: "change-key" });
  assert.equal(changed.periodicity, "fortnightly");
  await database.query("insert into public.shared_tax_reporting_periods values ($1,$2,$3,'2026-10-Q1')", [tenantId, organizationId, companyId]);
  await expectDatabaseError(setPeriodicity({ periodicity: "monthly", expected: "fortnightly", reason: "Corrección", key: "locked-key" }), "TAX_REPORTING_PERIODICITY_LOCKED");

  const audited = await readPeriodicity(readerId);
  assert.equal(audited.periodicity, "fortnightly");
  assert.equal(audited.persistedPeriods, 1);
  assert.deepEqual(audited.events.map((event) => [event.from, event.to]), [["monthly", "fortnightly"], [null, "monthly"]], "every change is audited newest first");

  await expectPermissionDenied(async () => {
    await database.exec("set role authenticated");
    try { await database.query("select * from public.shared_tax_reporting_periodicity_events"); } finally { await database.exec("reset role"); }
  });

  const summary = (await database.query("select public.shared_product_tax_assignment_summary($1,$2,$3,$4,'2026-10-23') as result", [tenantId, organizationId, companyId, readerId])).rows[0].result;
  assert.equal(summary.activeProducts, 5, "inactive products are excluded");
  assert.equal(summary.unassigned, 2, "closed and missing assignments are reported as unassigned");
  assert.equal(summary.legacyMismatch, 1, "legacy catalogue type disagreeing with the assignment is reported");
  assert.deepEqual(summary.groups.map((group) => [group.treatment, group.category, group.products]), [["exempt", null, 2], ["taxed", "general", 1]]);
  await expectDatabaseError(database.query("select public.shared_product_tax_assignment_summary($1,$2,$3,$4,'2026-10-23')", [tenantId, organizationId, companyId, "00000000-0000-4000-8000-000000000009"]), "ORGANIZATIONAL_USER_ACCESS_DENIED");

  // PostgREST runs STABLE RPCs in read-only transactions.
  await database.exec("begin transaction read only");
  try {
    await readPeriodicity(readerId);
    await database.query("select public.shared_product_tax_assignment_summary($1,$2,$3,$4,'2026-10-23')", [tenantId, organizationId, companyId, readerId]);
  } finally { await database.exec("rollback"); }

  console.log("IVA configuration SQL migration passed: unconfigured start, permission boundary, idempotent replay and conflict, compare-and-swap, reason requirement, lock after persisted periods, audit trail, table privileges, product assignment counts, and read-only reads.");
} finally {
  await database.close();
}

/** @param {() => Promise<unknown>} operation @returns {Promise<void>} Ensures direct table privileges are absent. */
async function expectPermissionDenied(operation) {
  await assert.rejects(operation, (error) => error.code === "42501");
}
