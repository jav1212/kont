import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";
const modulePath = process.env.PGLITE_MODULE_PATH;
const tenant = "00000000-0000-4000-8000-000000000001",
  organization = "00000000-0000-4000-8000-000000000011",
  actor = "00000000-0000-4000-8000-000000000021",
  company = "J-12345678-9";
test(
  "payment-order RPCs enforce scope, CAS, draft transitions, and audit snapshots",
  { skip: !modulePath },
  async () => {
    const { PGlite } = await import(pathToFileURL(modulePath!).href);
    const db = new PGlite();
    try {
      await db.exec(
        `create schema auth;create role anon;create role authenticated;create role service_role;create table auth.users(id uuid primary key,email text);create function auth.uid()returns uuid language sql as $$select null::uuid$$;create function public.gen_random_uuid()returns uuid language sql as $$select '00000000-0000-4000-8000-000000000099'::uuid$$;create table public.tenants(id uuid primary key);create table public.organizations(id uuid primary key,legacy_tenant_id uuid,status text not null);create table public.shared_companies(tenant_id uuid,id text,organization_id uuid,primary key(tenant_id,id),unique(organization_id,id));create table public.organization_memberships(id uuid primary key,organization_id uuid,user_id uuid,role_id uuid,status text,version integer default 1,authorization_version integer default 1,unique(organization_id,user_id));create table public.organization_roles(id uuid primary key,organization_id uuid,code text,status text);create table public.organization_role_permissions(role_id uuid,permission_code text,primary key(role_id,permission_code));create table public.access_control_permissions(code text primary key,resource text,action text,description text);create table public.profiles(id uuid primary key,name text);create table public.shared_inventory_products(tenant_id uuid,id text,company_id text,name text,status text default 'active',primary key(tenant_id,id));create table public.shared_inventory_sales_invoices(tenant_id uuid,id text,company_id text,status text default 'draft',primary key(tenant_id,id));create table public.shared_inventory_purchase_invoices(tenant_id uuid,id text,company_id text,status text default 'draft',primary key(tenant_id,id));create table public.shared_inventory_customers(tenant_id uuid,id text,company_id text,name text,primary key(tenant_id,id));create table public.shared_employees(tenant_id uuid,id text,company_id text,name text,primary key(tenant_id,id));create table public.shared_payroll_receipts(tenant_id uuid,id text,company_id text,primary key(tenant_id,id));create table public.shared_accounting_entries(tenant_id uuid,id text,company_id text,status text default 'draft',primary key(tenant_id,id));create table public.shared_sales_receivables(tenant_id uuid,id text,company_id text,primary key(tenant_id,id));create table public.shared_sales_receivable_payments(tenant_id uuid,id text,receivable_id text,primary key(tenant_id,id));create table public.shared_sales_payment_reversals(tenant_id uuid,id text,payment_id text,primary key(tenant_id,id));insert into public.tenants values('${tenant}');insert into public.organizations values('${organization}','${tenant}','active');insert into auth.users values('${actor}','actor@test');insert into public.shared_companies values('${tenant}','${company}','${organization}');insert into public.organization_roles values('00000000-0000-4000-8000-000000000031','${organization}','owner','active');insert into public.organization_memberships values('00000000-0000-4000-8000-000000000041','${organization}','${actor}','00000000-0000-4000-8000-000000000031','active');`,
      );
      for (const migration of [
        "291_user_security_access.sql",
        "292_operational_audit_trail.sql",
        "295_payment_orders_audit.sql",
      ])
        await db.exec(
          await readFile(
            new URL(
              `../../../../../supabase/migrations/${migration}`,
              import.meta.url,
            ),
            "utf8",
          ),
        );
      await db.exec(
        "insert into public.access_control_permissions values('companies.read','companies','read','read') on conflict do nothing;insert into public.organization_role_permissions values('00000000-0000-4000-8000-000000000031','companies.read') on conflict do nothing;set role service_role",
      );
      const created = await db.query(
        "select public.create_payment_order($1,$2,$3,'po-1','Proveedor','Servicio',$4,'VES','2026-10-31','branch-1','device-1') value",
        [actor, organization, company, "12.34000000"],
      );
      assert.equal(created.rows[0].value.amount, "12.34000000");
      const updated = await db.query(
        "select public.update_payment_order($1,$2,$3,'po-1',1,null,'Servicio dos',null,null,null,true,'branch-2','device-2') value",
        [actor, organization, company],
      );
      assert.equal(updated.rows[0].value.due_date, null);
      assert.equal(updated.rows[0].value.version, 2);
      await assert.rejects(
        db.query(
          "select public.update_payment_order($1,$2,$3,'po-1',1,'x',null,null,null,null,false,null,null)",
          [actor, organization, company],
        ),
        /PAYMENT_ORDER_CONFLICT/,
      );
      const cancelled = await db.query(
        "select public.cancel_payment_order($1,$2,$3,'po-1',2,null,null) value",
        [actor, organization, company],
      );
      assert.equal(cancelled.rows[0].value.status, "cancelled");
      await assert.rejects(
        db.query(
          "select public.update_payment_order($1,$2,$3,'po-1',3,'x',null,null,null,null,false,null,null)",
          [actor, organization, company],
        ),
        /PAYMENT_ORDER_CONFLICT/,
      );
      await db.query(
        "select public.create_payment_order($1,$2,$3,'po-delete','Proveedor','Temporal',1,'VES',null,null,null)",
        [actor, organization, company],
      );
      await db.query(
        "select public.delete_payment_order($1,$2,$3,'po-delete',1,null,null)",
        [actor, organization, company],
      );
      await db.exec("reset role");
      const actions = await db.query(
        "select action,before_snapshot,after_snapshot,branch_id,device_id from public.shared_operational_audit_trail where entity_id='po-1' order by occurred_at,id",
      );
      assert.deepEqual(
        actions.rows.map((row: { action: string }) => row.action),
        ["create", "update", "cancel"],
      );
      assert.equal(actions.rows[0].branch_id, "branch-1");
      assert.equal(actions.rows[1].after_snapshot.due_date, null);
      const deletion = await db.query(
        "select action,before_snapshot,after_snapshot from public.shared_operational_audit_trail where entity_id='po-delete' order by occurred_at,id",
      );
      assert.deepEqual(
        deletion.rows.map((row: { action: string }) => row.action),
        ["create", "delete"],
      );
      assert.equal(deletion.rows[1].after_snapshot, null);
      await db.exec("set role service_role");
      await assert.rejects(
        db.query(
          "select public.create_payment_order($1,$2,'other','bad','x','x',1,'VES',null,null,null)",
          [actor, organization],
        ),
        /COMPANY_INVALID/,
      );
      await assert.rejects(
        db.query(
          "select public.create_payment_order($1,$2,$3,'bad','x','x','NaN'::numeric,'VES',null,null,null)",
          [actor, organization, company],
        ),
        /PAYMENT_ORDER_INVALID/,
      );
      await assert.rejects(
        db.query("select public.payment_order_json($1,$2,$3,'po-1')", [
          tenant,
          organization,
          company,
        ]),
        /permission denied/,
      );
      await assert.rejects(
        db.query(
          "select public.create_payment_order($1,$2,$3,'bad-precision','x','x',0.000000001,'VES',null,null,null)",
          [actor, organization, company],
        ),
        /PAYMENT_ORDER_INVALID/,
      );
      await db.exec(
        "reset role;delete from organization_role_permissions where permission_code='payment_orders.create';set role service_role",
      );
      await assert.rejects(
        db.query(
          "select public.create_payment_order($1,$2,$3,'denied','x','x',1,'VES',null,null,null)",
          [actor, organization, company],
        ),
        /ACCESS_DENIED/,
      );
      await db.exec("reset role");
      assert.equal(
        (
          await db.query(
            "select count(*)::int count from shared_operational_audit_trail where entity_id in ('bad','bad-precision','denied')",
          )
        ).rows[0].count,
        0,
      );
      await db.exec("reset role;set role authenticated");
      await assert.rejects(
        db.query("select public.get_payment_order($1,$2,$3,'po-1')", [
          actor,
          organization,
          company,
        ]),
        /permission denied/,
      );
    } finally {
      await db.close();
    }
  },
);
