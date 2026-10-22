/** Verifies invoice-only credit-limit enforcement in disposable PostgreSQL. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const tenant = "00000000-0000-4000-8000-000000000001";
const organization = "00000000-0000-4000-8000-000000000011";
const actor = "00000000-0000-4000-8000-000000000021";

test("delivery notes bypass invoice credit-limit authorization while invoices retain it", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table public.shared_inventory_sales_invoices(
        tenant_id uuid not null,company_id text not null,id text not null,customer_id text not null,
        status text not null,document_type text not null,payment_terms text not null,
        credit_amount numeric,credit_exchange_rate numeric,security_price_list_id text,
        primary key(tenant_id,id));
      create table public.shared_inventory_customers(
        tenant_id uuid not null,company_id text not null,id text not null);
      create table public.shared_customer_credit_limits(
        tenant_id uuid not null,company_id text not null,customer_id text not null,limit_ves numeric not null);
      create table public.shared_sales_receivables(
        tenant_id uuid not null,company_id text not null,customer_id text not null,id text not null,
        original_amount numeric not null,debt_exchange_rate numeric not null,status text not null);
      create table public.shared_sales_receivable_payments(
        tenant_id uuid not null,receivable_id text not null,id text not null,applied_debt_amount numeric not null);
      create table public.shared_sales_payment_reversals(tenant_id uuid not null,payment_id text not null);
      create table public.organization_memberships(id uuid,organization_id uuid,user_id uuid);
      create table public.organization_scoped_grant_policies(
        membership_id uuid,permission_code text,target_kind text,company_id text);
      create function public.assert_user_security_access(uuid,uuid,text,text) returns uuid
        language plpgsql as $$ begin
          if $4='sales.overdrawn_customer.bill' then raise exception 'CREDIT_OVERRIDE_REQUIRED'; end if;
          return '${tenant}'::uuid;
        end $$;
      create function public.organization_scoped_grant_has(uuid,uuid,text,text,text,text)
        returns boolean language sql stable as $$ select true $$;
      create function public.set_operational_audit_context(uuid,uuid,text,text,text)
        returns void language sql as $$ select null::void $$;
      create function public.shared_inventory_sales_invoice_confirm_with_register(uuid,text,uuid,boolean,text)
        returns jsonb language plpgsql as $$ begin
          update public.shared_inventory_sales_invoices set status='confirmada'
            where tenant_id=$1 and id=$2;
          return jsonb_build_object('id',$2);
        end $$;
      insert into public.shared_inventory_customers values('${tenant}','company','customer');
      insert into public.shared_customer_credit_limits values('${tenant}','company','customer',10);
      insert into public.shared_inventory_sales_invoices
        (tenant_id,company_id,id,customer_id,status,document_type,payment_terms,credit_amount,credit_exchange_rate)
      values
        ('${tenant}','company','note','customer','borrador','nota_entrega','credito',null,null),
        ('${tenant}','company','second-note','customer','borrador','nota_entrega','credito',1000,1),
        ('${tenant}','company','within-limit','customer','borrador','venta','credito',5,1),
        ('${tenant}','company','over-limit','customer','borrador','venta','credito',20,1);
    `);
    await db.exec(await readFile(new URL("../../../../../supabase/migrations/366_sales_delivery_note_credit_limit.sql", import.meta.url), "utf8"));
    const confirm = async (id) => (await db.query(
      "select public.confirm_web_sales_invoice_secure($1,$2,'company',$3) as receipt",
      [actor, organization, id],
    )).rows[0].receipt;
    assert.equal((await confirm("note")).status, "confirmed");
    assert.equal((await confirm("within-limit")).status, "confirmed");
    await assert.rejects(() => confirm("over-limit"), /CREDIT_OVERRIDE_REQUIRED/);
    await db.exec(`insert into public.shared_sales_receivables values
      ('${tenant}','company','customer','existing-debt',20,1,'open')`);
    assert.equal((await confirm("second-note")).status, "confirmed");
    assert.deepEqual((await db.query("select id,status from public.shared_inventory_sales_invoices order by id")).rows, [
      { id: "note", status: "confirmada" },
      { id: "over-limit", status: "borrador" },
      { id: "second-note", status: "confirmada" },
      { id: "within-limit", status: "confirmada" },
    ]);
  } finally {
    await db.close();
  }
});
