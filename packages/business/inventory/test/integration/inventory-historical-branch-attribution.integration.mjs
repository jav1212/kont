/** Exercises historical attribution and disjoint consolidation coverage in disposable PostgreSQL. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const tenant = "00000000-0000-4000-8000-000000000001";
const organization = "00000000-0000-4000-8000-000000000011";
const actor = "00000000-0000-4000-8000-000000000021";
const branch = "00000000-0000-4000-8000-000000000031";

test("reviewed historical movements gain one immutable branch while unlinked coverage decreases", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema extensions;
      -- PGlite lacks pgcrypto; the deterministic double only tests fingerprint changes and replay.
      create function extensions.digest(text,text) returns bytea language sql immutable
        as $$ select decode(md5($1)||md5($1),'hex') $$;
      create table public.organizations(id uuid primary key);
      create table public.shared_companies(
        tenant_id uuid not null, id text not null, organization_id uuid not null references public.organizations(id),
        status text not null default 'active', primary key(tenant_id,id));
      create table public.shared_company_branches(
        id uuid not null, tenant_id uuid not null, organization_id uuid not null,
        company_id text not null, code text not null, name text not null,
        primary key(id), unique(id,tenant_id,company_id));
      create table public.shared_company_branch_memberships(
        tenant_id uuid,organization_id uuid,company_id text,branch_id uuid,user_id uuid,status text);
      create table public.shared_inventory_products(
        tenant_id uuid not null,company_id text not null,id text not null,name text not null,
        measure_unit text not null,code text not null default 'P',current_stock numeric not null default 0,
        primary key(tenant_id,company_id,id));
      create table public.shared_inventory_movements(
        tenant_id uuid not null,company_id text not null,id text not null,product_id text not null,
        type text not null,date date not null,quantity numeric not null,unit_cost numeric not null,
        total_cost numeric not null,currency text not null,purchase_invoice_id text,
        sales_invoice_id text,reference text,primary key(tenant_id,id));
      create table public.shared_inventory_purchase_invoices(
        tenant_id uuid,company_id text,id text,status text,branch_id uuid);
      create table public.shared_inventory_sales_invoices(
        tenant_id uuid,company_id text,id text,status text,branch_id uuid);
      create function public.assert_user_security_access(uuid,uuid,text,text) returns uuid
        language sql stable as $$ select '${tenant}'::uuid $$;
      create function public.assert_company_administration_access(uuid,uuid,text) returns uuid
        language sql stable as $$ select '${tenant}'::uuid $$;
      create function public.company_branch_user_can_select_any(uuid,uuid) returns boolean
        language sql stable as $$ select true $$;
      insert into public.organizations values('${organization}');
      insert into public.shared_companies values('${tenant}','company','${organization}','active');
      insert into public.shared_company_branches values('${branch}','${tenant}','${organization}',
        'company','MAIN','Main branch');
      insert into public.shared_inventory_products(tenant_id,company_id,id,name,measure_unit)
        values('${tenant}','company','product','Product','unit');
      insert into public.shared_inventory_movements values
        ('${tenant}','company','reviewed','product','ajuste_positivo','2026-10-01',2,5,10,'VES',null,null,'Reviewed source'),
        ('${tenant}','company','unlinked','product','ajuste_positivo','2026-10-01',1,5,5,'VES',null,null,'Unlinked source'),
        ('${tenant}','company','manual','product','ajuste_positivo','2026-10-01',3,5,15,'VES',null,null,'New manual'),
        ('${tenant}','company','purchase','product','entrada','2026-10-01',1,5,5,'VES','purchase-1',null,'Purchase');
      insert into public.shared_inventory_purchase_invoices values('${tenant}','company','purchase-1','confirmada',null);
    `);
    const base = new URL("../../../../../supabase/migrations/", import.meta.url);
    const manual = await readFile(new URL("356_inventory_manual_branch_adjustment.sql", base), "utf8");
    await db.exec(manual.split("create or replace function public.record_native_inventory_branch_adjustment")[0]);
    await db.exec(`insert into public.shared_inventory_manual_branch_movements
      (tenant_id,company_id,movement_id,branch_id,actor_user_id)
      values('${tenant}','company','manual','${branch}','${actor}')`);
    await db.exec(await readFile(new URL("360_inventory_historical_branch_attribution.sql", base), "utf8"));
    await db.exec(await readFile(new URL("361_inventory_historical_branch_consolidation.sql", base), "utf8"));
    await db.exec(await readFile(new URL("364_inventory_branch_readiness_disjoint_coverage.sql", base), "utf8"));

    const report = async () => (await db.query(
      "select public.get_native_inventory_branch_movement_consolidation($1,$2,'company','2026-10-01','2026-10-01',null) as value",
      [actor, organization],
    )).rows[0].value;
    const readiness = async () => (await db.query(
      "select public.get_native_inventory_branch_stock_readiness($1,$2,'company',25) as value",
      [actor, organization],
    )).rows[0].value;
    const before = await report();
    assert.deepEqual(before.coverage, {
      attributedMovementCount: 1, linkedWithoutBranchMovementCount: 1,
      unlinkedMovementCount: 2, includesCompanyWideCoverage: true,
    });
    const readinessBefore = await readiness();
    assert.equal(readinessBefore.attributedMovementCount, 1);
    assert.equal(readinessBefore.unlinkedMovementCount, 2);
    assert.equal(readinessBefore.linkedWithoutBranchMovementCount, 1);
    const preview = (await db.query(
      "select public.get_native_inventory_historical_movement_attribution_candidate($1,$2,'company','reviewed') as value",
      [actor, organization],
    )).rows[0].value;
    assert.match(preview.fingerprint, /^[0-9a-f]{64}$/);
    const attribute = async (fingerprint, reason, key) => (await db.query(
      "select public.attribute_native_inventory_historical_movement($1,$2,'company','reviewed',$3,$4,$5,$6) as value",
      [actor, organization, branch, fingerprint, reason, key],
    )).rows[0].value;
    await assert.rejects(() => attribute("0".repeat(64), "Reviewed inventory evidence", "stale"), /INVENTORY_BRANCH_ATTRIBUTION_STALE/);
    const first = await attribute(preview.fingerprint, "Reviewed inventory evidence", "review-1");
    assert.deepEqual(await attribute(preview.fingerprint, "Reviewed inventory evidence", "review-1"), first);
    await assert.rejects(() => attribute(preview.fingerprint, "Changed reviewed evidence", "review-1"), /INVENTORY_BRANCH_ATTRIBUTION_IDEMPOTENCY_CONFLICT/);
    await assert.rejects(() => attribute(preview.fingerprint, "Reviewed inventory evidence", "review-2"), /INVENTORY_BRANCH_ATTRIBUTION_ALREADY_ATTRIBUTED/);
    const after = await report();
    assert.deepEqual(after.coverage, {
      attributedMovementCount: 2, linkedWithoutBranchMovementCount: 1,
      unlinkedMovementCount: 1, includesCompanyWideCoverage: true,
    });
    const readinessAfter = await readiness();
    assert.equal(readinessAfter.attributedMovementCount, 2);
    assert.equal(readinessAfter.unlinkedMovementCount, 1);
    assert.equal(readinessAfter.linkedWithoutBranchMovementCount, 1);
    assert.ok(after.rows.some((row) => row.sourceType === "historical" && row.branchId === branch));
    assert.ok(after.rows.some((row) => row.sourceType === "manual" && row.branchId === branch));
    await assert.rejects(() => db.exec("update public.shared_inventory_movements set quantity=4 where id='reviewed'"), /INVENTORY_BRANCH_ATTRIBUTION_SOURCE_IMMUTABLE/);
    await assert.rejects(() => db.exec("update public.shared_inventory_products set measure_unit='kg' where id='product'"), /INVENTORY_BRANCH_ATTRIBUTION_UNIT_IMMUTABLE/);
  } finally {
    await db.close();
  }
});
