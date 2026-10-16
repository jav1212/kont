/** Runs delivery-note credit, numbering, and historical stock confirmation together. */
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

test("credit and numbering cooperate without creating delivery-note debt", async () => {
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
        customer_id text not null,document_type text not null,status text not null,
        payment_terms text not null,invoice_number text,security_price_list_id text,
        invoice_date date not null default '2026-10-02',confirmed_at timestamptz,updated_at timestamptz,
        sales_register_id text,sales_register_name text,sales_register_kind text,
        credit_currency_code text,credit_amount numeric,credit_exchange_rate numeric,
        credit_rate_effective_date date,credit_rate_source text,due_date date,
        primary key(tenant_id,id));
      create table public.shared_inventory_products(
        tenant_id uuid not null,id text not null,company_id text not null,active boolean not null,
        composition_kind text not null,current_stock numeric not null,average_cost numeric not null,
        updated_at timestamptz,
        code text not null,name text not null,measure_unit text not null,
        primary key(tenant_id,id));
      create table public.shared_inventory_sales_invoice_items(
        tenant_id uuid not null,id text not null,invoice_id text not null,product_id text,
        quantity numeric not null,unit_price numeric not null,currency text not null,
        currency_price numeric not null,dollar_rate numeric not null,vat_base numeric not null);
      create table public.shared_inventory_product_components(
        tenant_id uuid not null,composite_product_id text not null,component_product_id text not null,
        quantity numeric not null);
      create table public.shared_inventory_sales_invoice_item_components(
        tenant_id uuid not null,invoice_item_id text not null,component_product_id text not null,
        quantity numeric not null,component_code text not null,component_name text not null,
        component_measure_unit text not null);
      create table public.shared_inventory_movements(
        tenant_id uuid not null,id text not null,company_id text not null,product_id text not null,
        type text not null,date date not null,period text not null,quantity numeric not null,
        unit_cost numeric not null,total_cost numeric not null,balance_quantity numeric not null,
        currency text not null,currency_cost numeric,dollar_rate numeric,reference text not null,
        notes text not null,discount_type text,discount_value numeric not null,
        discount_amount numeric not null,surcharge_type text,surcharge_value numeric not null,
        surcharge_amount numeric not null,vat_base numeric not null,sale_price_unit numeric,
        purchase_invoice_id text,sales_invoice_id text not null);
      create table public.barcode_access_terminals(
        tenant_id uuid not null,id uuid not null,name text not null,status text not null);
      create table public.shared_inventory_customers(
        tenant_id uuid not null,company_id text not null,id text not null,
        primary key(tenant_id,id));
      create table public.shared_customer_credit_limits(
        tenant_id uuid not null,company_id text not null,customer_id text not null,
        limit_ves numeric not null);
      create table public.shared_sales_receivables(
        tenant_id uuid not null,id text not null default gen_random_uuid()::text,
        company_id text not null,customer_id text not null,sales_invoice_id text not null,
        debt_currency_code text not null,original_amount numeric not null,
        debt_exchange_rate numeric not null,rate_effective_date date not null,
        rate_source text not null,due_date date not null,status text not null default 'open',
        primary key(tenant_id,id),unique(tenant_id,sales_invoice_id));
      create table public.shared_sales_receivable_payments(
        tenant_id uuid not null,receivable_id text not null,id text not null,
        applied_debt_amount numeric not null);
      create table public.shared_sales_payment_reversals(tenant_id uuid,payment_id text);
      create table public.organization_memberships(id uuid,organization_id uuid,user_id uuid);
      create table public.organization_scoped_grant_policies(
        membership_id uuid,permission_code text,target_kind text,company_id text);
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
        language plpgsql as $$ begin
          if $4='sales.overdrawn_customer.bill' then raise exception 'CREDIT_OVERRIDE_REQUIRED'; end if;
          return '${tenant}'::uuid;
        end $$;
      create function public.company_document_series_scope_valid(uuid,uuid,text,text,uuid)
        returns boolean language sql stable as $$ select true $$;
      create function public.organization_scoped_grant_has(uuid,uuid,text,text,text,text)
        returns boolean language sql stable as $$ select true $$;
      create function public.set_operational_audit_context(uuid,uuid,text,text,text)
        returns void language plpgsql as $$ begin end $$;
      create function public.assert_native_sales_branch_access(uuid,uuid,text,uuid,uuid)
        returns uuid language sql stable as $$ select $5 $$;
      insert into public.tenants values('${tenant}');
      insert into public.organizations values('${organization}');
      insert into public.shared_companies values('${tenant}','company');
      insert into public.shared_inventory_customers values
        ('${tenant}','company','overdrawn'),('${tenant}','company','within');
      insert into public.shared_customer_credit_limits values
        ('${tenant}','company','overdrawn',10),('${tenant}','company','within',10);
      insert into public.shared_sales_receivables(
        tenant_id,company_id,customer_id,sales_invoice_id,debt_currency_code,
        original_amount,debt_exchange_rate,rate_effective_date,rate_source,due_date)
      values('${tenant}','company','overdrawn','prior','VES',20,1,'2026-10-02','bcv','2026-10-15');
      insert into public.shared_inventory_sales_invoices(
        tenant_id,company_id,id,customer_id,document_type,status,payment_terms,
        credit_currency_code,credit_amount,credit_exchange_rate,credit_rate_effective_date,
        credit_rate_source,due_date)
      values
        ('${tenant}','company','note','overdrawn','nota_entrega','borrador','credito',
          null,null,null,null,null,null),
        ('${tenant}','company','note-with-amount','overdrawn','nota_entrega','borrador','credito',
          'VES',1000,1,'2026-10-02','bcv','2026-10-15'),
        ('${tenant}','company','insufficient-note','overdrawn','nota_entrega','borrador','credito',
          null,null,null,null,null,null),
        ('${tenant}','company','over-limit-invoice','overdrawn','venta','borrador','credito',
          'VES',1,1,'2026-10-02','bcv','2026-10-15'),
        ('${tenant}','company','within-limit-invoice','within','venta','borrador','credito',
          'VES',5,1,'2026-10-02','bcv','2026-10-15');
      insert into public.shared_inventory_products values
        ('${tenant}','product','company',true,'simple',10,3,null,'P-1','Product','unit');
      insert into public.shared_inventory_sales_invoice_items values
        ('${tenant}','item-1','note','product',2,5,'VES',5,1,0),
        ('${tenant}','item-2','insufficient-note','product',9,5,'VES',5,1,0);
      insert into public.shared_company_document_series values
        ('${series}','${tenant}','${organization}','company',
         'sales_delivery_note','company',null,true,1,3,'NE-',1,null,null);
      insert into public.shared_company_document_series_selection_rules values
        ('${tenant}','${organization}','company','company',null,
         'sales_delivery_note','company_default','${series}');
    `);
    const movementMigration = await readFile(new URL("../../../../../supabase/migrations/210_allow_negative_inventory_balances.sql", import.meta.url), "utf8");
    const movementStart = movementMigration.indexOf("create or replace function public.shared_inventory_movement_save(");
    assert.ok(movementStart >= 0);
    const movementEnd = movementMigration.indexOf("$$;", movementStart);
    assert.ok(movementEnd > movementStart);
    await db.exec(movementMigration.slice(movementStart, movementEnd + 3));
    const stockMigration = await readFile(new URL("../../../../../supabase/migrations/264_shared_inventory_composite_products.sql", import.meta.url), "utf8");
    const stockStart = stockMigration.indexOf("create or replace function public.shared_inventory_sales_invoice_confirm(");
    assert.ok(stockStart >= 0);
    const stockEnd = stockMigration.indexOf("$$;", stockStart);
    assert.ok(stockEnd > stockStart);
    await db.exec(stockMigration.slice(stockStart, stockEnd + 3));
    const actorMigration = await readFile(new URL("../../../../../supabase/migrations/277_sales_performance_confirmation_actor.sql", import.meta.url), "utf8");
    const actorStart = actorMigration.indexOf("create or replace function public.shared_inventory_sales_invoice_confirm_attributed(");
    assert.ok(actorStart >= 0);
    const actorEnd = actorMigration.indexOf("end $$;", actorStart);
    assert.ok(actorEnd > actorStart);
    await db.exec(actorMigration.slice(actorStart, actorEnd + 7));
    await db.exec(await readFile(new URL("../../../../../supabase/migrations/278_sales_performance_register_identity.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../../../../../supabase/migrations/365_sales_credit_receivable_invoice_only.sql", import.meta.url), "utf8"));
    await db.exec(`create trigger shared_sales_credit_receivable_confirmed
      before update of status on public.shared_inventory_sales_invoices
      for each row execute function public.shared_sales_credit_confirmed_receivable()`);
    await db.exec(await readFile(new URL("../../../../../supabase/migrations/366_sales_delivery_note_credit_limit.sql", import.meta.url), "utf8"));
    await db.exec(`
      create function public.confirm_native_sales_invoice_secure(uuid,uuid,text,text,boolean,text,text,text)
        returns jsonb language sql as $$
          select public.confirm_web_sales_invoice_secure($1,$2,$3,$4,$5,$6,$7,$8,null)
        $$;
      create function public.confirm_native_sales_invoice_branch_secure(uuid,uuid,text,text,uuid,boolean,text,text,text)
        returns jsonb language sql as $$
          select public.confirm_web_sales_invoice_secure($1,$2,$3,$4,$6,$7,$8,$9,null)
        $$;
    `);
    await db.exec(await readFile(new URL("../../../../../supabase/migrations/367_sales_delivery_note_document_series_issuance.sql", import.meta.url), "utf8"));
    const issue = async (id, key, register = null) => (await db.query(`
      select public.confirm_native_sales_delivery_note_with_document_series_secure(
        $1,$2,'company',$3,$4,'company',null,'policy',null,false,null,null,null,null,$5) as receipt
    `, [actor, organization, id, key, register])).rows[0].receipt;
    await assert.rejects(() => issue("note", "note-failure-key", "missing-register"), /SALES_REGISTER_INVALID/);
    assert.equal((await db.query("select next_number from public.shared_company_document_series where id=$1", [series])).rows[0].next_number, 1);
    assert.equal((await db.query("select current_stock from public.shared_inventory_products where id='product'")).rows[0].current_stock, "10");
    assert.equal((await issue("note", "note-success-key")).displayNumber, "NE-00000001");
    assert.equal((await issue("note", "note-success-key")).replayed, true);
    assert.equal((await db.query("select current_stock from public.shared_inventory_products where id='product'")).rows[0].current_stock, "8");
    assert.deepEqual((await db.query("select sales_invoice_id,product_id,quantity,unit_cost,total_cost,balance_quantity,reference from public.shared_inventory_movements")).rows, [
      { sales_invoice_id: "note", product_id: "product", quantity: "2", unit_cost: "3", total_cost: "6", balance_quantity: "8", reference: "NE-00000001" },
    ]);
    await assert.rejects(() => issue("insufficient-note", "insufficient-key"), /Insufficient stock/);
    assert.equal((await db.query("select next_number from public.shared_company_document_series where id=$1", [series])).rows[0].next_number, 2);
    assert.equal((await db.query("select current_stock from public.shared_inventory_products where id='product'")).rows[0].current_stock, "8");
    assert.equal((await issue("note-with-amount", "note-amount-key")).displayNumber, "NE-00000002");
    assert.deepEqual((await db.query("select sales_invoice_id from public.shared_sales_receivables order by sales_invoice_id")).rows, [
      { sales_invoice_id: "prior" },
    ]);
    await assert.rejects(() => db.query(
      "select public.confirm_web_sales_invoice_secure($1,$2,'company','over-limit-invoice')",
      [actor, organization],
    ), /CREDIT_OVERRIDE_REQUIRED/);
    assert.equal((await db.query(
      "select public.confirm_web_sales_invoice_secure($1,$2,'company','within-limit-invoice') as receipt",
      [actor, organization],
    )).rows[0].receipt.status, "confirmed");
    assert.deepEqual((await db.query("select sales_invoice_id from public.shared_sales_receivables order by sales_invoice_id")).rows, [
      { sales_invoice_id: "prior" }, { sales_invoice_id: "within-limit-invoice" },
    ]);
    assert.deepEqual((await db.query("select id,status from public.shared_inventory_sales_invoices order by id")).rows, [
      { id: "insufficient-note", status: "borrador" },
      { id: "note", status: "confirmada" },
      { id: "note-with-amount", status: "confirmada" },
      { id: "over-limit-invoice", status: "borrador" },
      { id: "within-limit-invoice", status: "confirmada" },
    ]);
  } finally {
    await db.close();
  }
});
