/**
 * Exercises the company monetary-policy migration against disposable embedded PostgreSQL.
 * The script never connects to Supabase or another external database.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const db = new PGlite();
const tenantId = "00000000-0000-4000-8000-000000000001";
const organizationId = "00000000-0000-4000-8000-000000000011";
const actorId = "00000000-0000-4000-8000-000000000021";
const outsideActorId = "00000000-0000-4000-8000-000000000022";
const companyId = "J-12345678-9";

const policy = (referenceCurrencyCodes) => ({
  operatingCurrency: { code: "VES", minorUnit: 2 },
  referenceCurrencyCodes,
  rateSource: "bcv",
  roundingProfile: "commercial_v1",
  allowPreviousAvailableDate: false,
  maxPreviousDays: 0,
});

async function configure({ actor = actorId, company = companyId, expectedVersion, key, reason = "Configuración inicial", settings = policy(["USD"]) }) {
  const result = await db.query(
    `select public.configure_native_company_monetary_policy($1,$2,$3,$4,$5,$6,$7::jsonb) as result`,
    [actor, organizationId, company, expectedVersion, key, reason, JSON.stringify(settings)],
  );
  return result.rows[0].result;
}

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.organizations(id uuid primary key);
    create table public.shared_companies(
      tenant_id uuid not null,
      id text not null,
      organization_id uuid not null,
      status text not null,
      primary key (tenant_id, id),
      unique (tenant_id, id, organization_id)
    );
    create function public.assert_company_administration_access(
      p_organization_id uuid, p_actor_user_id uuid, p_permission text
    ) returns uuid language plpgsql as $$
    begin
      if p_organization_id <> '${organizationId}'::uuid
        or p_actor_user_id <> '${actorId}'::uuid
        or p_permission not in ('companies.read', 'companies.update') then
        raise exception 'COMPANY_ACCESS_DENIED';
      end if;
      return '${tenantId}'::uuid;
    end;
    $$;
    create sequence public.fixture_uuid_sequence;
    create function public.gen_random_uuid() returns uuid
      language sql volatile as $$
        select ('00000000-0000-4000-9000-' || lpad(nextval('public.fixture_uuid_sequence')::text, 12, '0'))::uuid
      $$;
    insert into public.organizations(id) values ('${organizationId}');
    insert into public.shared_companies(tenant_id,id,organization_id,status) values
      ('${tenantId}','${companyId}','${organizationId}','active'),
      ('${tenantId}','J-87654321-0','${organizationId}','active');
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/289_company_monetary_policy.sql", import.meta.url), "utf8"));

  const grants = (await db.query(`
    select
      has_table_privilege('anon', 'public.shared_company_monetary_policies', 'select') as anon_read,
      has_table_privilege('authenticated', 'public.shared_company_monetary_policy_events', 'select') as authenticated_event_read,
      has_table_privilege('service_role', 'public.shared_company_monetary_policies', 'select') as service_direct_read,
      has_function_privilege('service_role', 'public.configure_native_company_monetary_policy(uuid,uuid,text,integer,text,text,jsonb)', 'execute') as service_write_rpc,
      has_function_privilege('authenticated', 'public.configure_native_company_monetary_policy(uuid,uuid,text,integer,text,text,jsonb)', 'execute') as authenticated_write_rpc
  `)).rows[0];
  assert.deepEqual(grants, {
    anon_read: false,
    authenticated_event_read: false,
    service_direct_read: false,
    service_write_rpc: true,
    authenticated_write_rpc: false,
  });

  const absent = (await db.query(
    `select public.get_native_company_monetary_policy($1,$2,$3,null) as result`,
    [actorId, organizationId, companyId],
  )).rows[0].result;
  assert.equal(absent, null);

  const first = await configure({ expectedVersion: 0, key: "policy-create-1" });
  assert.equal(first.policy_version, 1);
  assert.deepEqual(first.reference_currency_codes, ["USD"]);
  assert.deepEqual(await configure({ expectedVersion: 0, key: "policy-create-1" }), first);
  assert.equal((await db.query("select count(*)::int as count from public.shared_company_monetary_policy_events")).rows[0].count, 1);

  await assert.rejects(
    configure({ expectedVersion: 0, key: "policy-create-1", reason: "Different intent" }),
    /COMPANY_MONETARY_POLICY_IDEMPOTENCY_CONFLICT/,
  );
  await assert.rejects(
    configure({ expectedVersion: 0, key: "policy-stale" }),
    /COMPANY_MONETARY_POLICY_VERSION_CONFLICT/,
  );
  await assert.rejects(
    configure({ expectedVersion: 0, key: "policy-invalid", settings: policy(["VES"]) }),
    /COMPANY_MONETARY_POLICY_INVALID/,
  );
  await assert.rejects(
    configure({ actor: outsideActorId, expectedVersion: 1, key: "policy-outside" }),
    /COMPANY_ACCESS_DENIED/,
  );

  const second = await configure({ expectedVersion: 1, key: "policy-update-2", reason: "Habilitar EUR", settings: policy(["EUR", "USD"]) });
  assert.equal(second.policy_version, 2);
  assert.deepEqual(second.reference_currency_codes, ["EUR", "USD"]);
  const historical = (await db.query(
    `select public.get_native_company_monetary_policy($1,$2,$3,1) as result`,
    [actorId, organizationId, companyId],
  )).rows[0].result;
  assert.equal(historical.policy_version, 1);
  assert.deepEqual(historical.reference_currency_codes, ["USD"]);
  assert.equal((await db.query("select count(*)::int as count from public.shared_company_monetary_policy_revisions")).rows[0].count, 2);
  assert.equal((await db.query("select count(*)::int as count from public.shared_company_monetary_policy_events")).rows[0].count, 2);
  assert.deepEqual((await db.query(
    "select previous_policy->>'policy_version' as previous_version from public.shared_company_monetary_policy_events where policy_version=2",
  )).rows[0], { previous_version: "1" });
  await assert.rejects(
    db.query("update public.shared_company_monetary_policy_revisions set reference_currency_codes=ARRAY['EUR']::text[] where policy_version=1"),
    /COMPANY_MONETARY_POLICY_EVIDENCE_IMMUTABLE/,
  );

  const [raceA, raceB] = await Promise.all([
    configure({ company: "J-87654321-0", expectedVersion: 0, key: "concurrent-create" }),
    configure({ company: "J-87654321-0", expectedVersion: 0, key: "concurrent-create" }),
  ]);
  assert.deepEqual([raceA.policy_version, raceB.policy_version], [1, 1]);
  assert.equal((await db.query(
    "select count(*)::int as count from public.shared_company_monetary_policy_events where company_id='J-87654321-0'",
  )).rows[0].count, 1);

  console.log("PASS: monetary-policy migration locks direct access, scopes reads and writes, preserves immutable revisions, deduplicates concurrent retries, detects stale/conflicting requests, and records before/after audit evidence.");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.close();
}
