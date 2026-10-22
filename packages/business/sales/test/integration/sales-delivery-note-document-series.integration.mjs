/** Exercises delivery-note numbering in disposable PostgreSQL, with confirmation dependencies stubbed. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const tenant = "00000000-0000-4000-8000-000000000001";
const organization = "00000000-0000-4000-8000-000000000011";
const actor = "00000000-0000-4000-8000-000000000021";
const series = "00000000-0000-4000-8000-000000000031";

test("delivery-note series commits exactly one number with confirmation and rolls back failures", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema extensions;
      create function extensions.digest(text,text) returns bytea language sql immutable
        as $$ select decode(md5($1)||md5($1),'hex') $$;
      create table public.tenants(id uuid primary key);
      create table public.organizations(id uuid primary key);
      create table public.shared_companies(tenant_id uuid not null,id text not null,
        primary key(tenant_id,id));
      create table public.shared_inventory_sales_invoices(
        tenant_id uuid not null,company_id text not null,id text not null,
        document_type text not null,status text not null,invoice_number text,
        primary key(tenant_id,id));
      create table public.shared_company_document_series(
        id uuid not null,tenant_id uuid not null,organization_id uuid not null,company_id text not null,
        document_type text not null,scope_kind text not null,branch_id uuid,active boolean not null,
        next_number integer not null,maximum_number integer not null,prefix text,version integer not null,
        updated_by uuid,updated_at timestamptz,
        primary key(id),unique(id,tenant_id,organization_id,company_id));
      create table public.shared_company_document_series_selection_rules(
        tenant_id uuid not null,organization_id uuid not null,company_id text not null,
        scope_kind text not null,branch_id uuid,document_type text not null,policy text not null,
        default_series_id uuid);
      create table public.shared_sales_invoice_series_allocations(
        tenant_id uuid not null,invoice_id text not null);
      create function public.assert_user_security_access(uuid,uuid,text,text) returns uuid
        language sql stable as $$ select '${tenant}'::uuid $$;
      create function public.company_document_series_scope_valid(uuid,uuid,text,text,uuid)
        returns boolean language sql stable as $$ select true $$;
      create function public.assert_native_sales_branch_access(uuid,uuid,text,uuid,uuid)
        returns uuid language sql stable as $$ select $5 $$;
      create function public.confirm_native_sales_invoice_secure(uuid,uuid,text,text,boolean,text,text,text)
        returns jsonb language plpgsql as $$ begin
          if $4='failed-note' then raise exception 'REGISTER_INVALID'; end if;
          update public.shared_inventory_sales_invoices set status='confirmada'
            where tenant_id='${tenant}' and id=$4 and status='borrador';
          return jsonb_build_object('status','confirmed');
        end $$;
      create function public.confirm_web_sales_invoice_secure(uuid,uuid,text,text,boolean,text,text,text,text)
        returns jsonb language sql as $$
          select public.confirm_native_sales_invoice_secure($1,$2,$3,$4,$5,$6,$7,$8)
        $$;
      create function public.confirm_native_sales_invoice_branch_secure(uuid,uuid,text,text,uuid,boolean,text,text,text)
        returns jsonb language sql as $$
          select public.confirm_native_sales_invoice_secure($1,$2,$3,$4,$6,$7,$8,$9)
        $$;
      insert into public.tenants values('${tenant}');
      insert into public.organizations values('${organization}');
      insert into public.shared_companies values('${tenant}','company');
      insert into public.shared_inventory_sales_invoices values
        ('${tenant}','company','note','nota_entrega','borrador',null),
        ('${tenant}','company','failed-note','nota_entrega','borrador',null),
        ('${tenant}','company','last-note','nota_entrega','borrador',null),
        ('${tenant}','company','after-last-note','nota_entrega','borrador',null),
        ('${tenant}','company','smoke-note','nota_entrega','borrador',null),
        ('${tenant}','company','invoice','venta','borrador',null);
      insert into public.shared_company_document_series values
        ('${series}','${tenant}','${organization}','company',
         'sales_delivery_note','company',null,true,7,8,'NE-',1,null,null);
      insert into public.shared_company_document_series_selection_rules values
        ('${tenant}','${organization}','company','company',null,
         'sales_delivery_note','company_default','${series}');
    `);
    await db.exec(await readFile(new URL("../../../../../supabase/migrations/367_sales_delivery_note_document_series_issuance.sql", import.meta.url), "utf8"));
    const access = (await db.query(`
      select c.relrowsecurity as rls,
        has_table_privilege('authenticated',c.oid,'SELECT') as client_read,
        has_table_privilege('service_role',c.oid,'INSERT') as service_insert,
        has_function_privilege('authenticated',
          'public.confirm_native_sales_delivery_note_with_document_series_secure(uuid,uuid,text,text,text,text,uuid,text,uuid,boolean,text,text,text,uuid,text)',
          'EXECUTE') as client_execute,
        has_function_privilege('service_role',
          'public.confirm_native_sales_delivery_note_with_document_series_secure(uuid,uuid,text,text,text,text,uuid,text,uuid,boolean,text,text,text,uuid,text)',
          'EXECUTE') as service_execute
      from pg_class c where c.oid='public.shared_sales_delivery_note_series_allocations'::regclass
    `)).rows[0];
    assert.deepEqual(access, {
      rls: true, client_read: false, service_insert: false,
      client_execute: false, service_execute: true,
    });
    const issue = async (id, key, selection = "policy", selectedSeries = null) => (await db.query(`
      select public.confirm_native_sales_delivery_note_with_document_series_secure(
        $1,$2,'company',$3,$4,'company',null,$5,$6) as receipt
    `, [actor, organization, id, key, selection, selectedSeries])).rows[0].receipt;
    await assert.rejects(() => issue("invoice", "wrong-type-key"), /SALES_DOCUMENT_SERIES_INVALID/);
    await assert.rejects(() => issue("failed-note", "failed-note-key"), /REGISTER_INVALID/);
    assert.deepEqual((await db.query(`select next_number from public.shared_company_document_series where id=$1`, [series])).rows, [
      { next_number: 7 },
    ]);
    assert.equal((await db.query("select count(*)::integer as total from public.shared_sales_delivery_note_series_allocations")).rows[0].total, 0);
    const first = await issue("note", "note-issue-key");
    assert.deepEqual(first, {
      deliveryNoteId: "note", companyId: "company", status: "confirmed",
      seriesId: series, displayNumber: "NE-00000007", number: 7, replayed: false,
    });
    assert.deepEqual(await issue("note", "note-issue-key"), { ...first, replayed: true });
    await assert.rejects(() => issue("failed-note", "note-issue-key"), /SALES_DOCUMENT_SERIES_IDEMPOTENCY_CONFLICT/);
    await assert.rejects(() => issue("note", "new-issue-key"), /SALES_ORDER_TRANSITION_INVALID/);
    assert.deepEqual((await db.query(`select next_number from public.shared_company_document_series where id=$1`, [series])).rows, [
      { next_number: 8 },
    ]);
    assert.deepEqual((await db.query("select delivery_note_id,number from public.shared_sales_delivery_note_series_allocations")).rows, [
      { delivery_note_id: "note", number: 7 },
    ]);
    const last = await issue("last-note", "last-note-key", "explicit", series);
    assert.equal(last.displayNumber, "NE-00000008");
    assert.equal(last.replayed, false);
    assert.equal((await issue("last-note", "last-note-key", "explicit", series)).replayed, true);
    await assert.rejects(() => issue("after-last-note", "after-last-key"), /SALES_DOCUMENT_SERIES_SELECTION_INVALID/);
    assert.deepEqual((await db.query("select next_number,active from public.shared_company_document_series where id=$1", [series])).rows, [
      { next_number: 8, active: false },
    ]);
    assert.equal((await db.query("select count(*)::integer as total from public.shared_sales_delivery_note_series_allocations")).rows[0].total, 2);

    await db.exec(`
      update public.shared_inventory_sales_invoices set status='confirmada'
        where id in ('failed-note','after-last-note');
      alter table public.shared_companies add column organization_id uuid;
      alter table public.shared_companies add column status text default 'active';
      update public.shared_companies set organization_id='${organization}';
      create table public.organization_memberships(organization_id uuid,user_id uuid,
        role_id uuid,status text);
      create table public.organization_roles(id uuid,organization_id uuid,status text);
      create table public.organization_role_permissions(role_id uuid,permission_code text);
      create table public.shared_sales_receivables(tenant_id uuid,sales_invoice_id text);
      insert into public.organization_roles values('${series}','${organization}','active');
      insert into public.organization_memberships values('${organization}','${actor}','${series}','active');
      insert into public.organization_role_permissions values
        ('${series}','sales.confirm'),('${series}','companies.update'),
        ('${series}','inventory.negative_stock.use');
      create or replace function public.confirm_web_sales_invoice_secure(uuid,uuid,text,text,boolean,text,text,text,text)
        returns jsonb language plpgsql as $$ begin
          if $9 like 'missing-%' then raise exception 'SALES_REGISTER_INVALID'; end if;
          return public.confirm_native_sales_invoice_secure($1,$2,$3,$4,$5,$6,$7,$8);
        end $$;
      create function public.create_native_company_document_series(
        uuid,uuid,text,text,text,uuid,text,text,text,integer,integer)
        returns jsonb language plpgsql security definer as $$
        declare v_id uuid := gen_random_uuid(); begin
          insert into public.shared_company_document_series values
            (v_id,'${tenant}',$2,$3,$7,$5,$6,true,$10,$11,$9,1,null,null);
          return jsonb_build_object('id',v_id);
        end $$;
      create function public.configure_native_company_document_series_selection_rule(
        uuid,uuid,text,text,text,uuid,text,integer,text,uuid)
        returns jsonb language plpgsql security definer as $$ begin
          update public.shared_company_document_series_selection_rules
            set policy=$9,default_series_id=$10
            where tenant_id='${tenant}' and organization_id=$2 and company_id=$3
              and document_type=$7 and scope_kind=$5 and branch_id is not distinct from $6;
          return '{}'::jsonb;
        end $$;
      create function public.list_native_company_document_series(uuid,uuid,text,text,uuid,text)
        returns jsonb language sql security definer as $$
          select coalesce(jsonb_agg(jsonb_build_object('id',id,'nextNumber',next_number)),'[]'::jsonb)
          from public.shared_company_document_series
          where organization_id=$2 and company_id=$3 and scope_kind=$4
            and branch_id is not distinct from $5 and document_type=$6
        $$;
      grant select on all tables in schema public to service_role;
    `);
    await db.exec(await readFile(new URL("../../../../../supabase/checks/sales_delivery_note_document_series_issuance_smoke.sql", import.meta.url), "utf8"));
    assert.deepEqual((await db.query("select status,invoice_number from public.shared_inventory_sales_invoices where id='smoke-note'")).rows, [
      { status: "borrador", invoice_number: null },
    ]);
    assert.equal((await db.query("select count(*)::integer as total from public.shared_company_document_series")).rows[0].total, 1);
    assert.equal((await db.query("select count(*)::integer as total from public.shared_sales_delivery_note_series_allocations")).rows[0].total, 2);
  } finally {
    await db.close();
  }
});
