/** Executes actual security migrations in disposable PostgreSQL; never connects to Supabase. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const { PGlite } = await import(
  process.env.PGLITE_MODULE_PATH
    ? pathToFileURL(process.env.PGLITE_MODULE_PATH).href
    : "@electric-sql/pglite"
);
const org = "00000000-0000-4000-8000-000000000001";
const tenant = "00000000-0000-4000-8000-000000000002";
const actor = "00000000-0000-4000-8000-000000000003";
const role = "00000000-0000-4000-8000-000000000004";
const membership = "00000000-0000-4000-8000-000000000005";

test("persistent commercial security composes permissions, company boundaries and atomic audit", async (t) => {
  const db = new PGlite();
  const confirm = (id, negative = false, priceList = null) =>
    db.query(
      "select public.confirm_native_sales_invoice_secure($1,$2,'company',$3,$4,$5,'branch','device') value",
      [actor, org, id, negative, priceList],
    );
  const reverse = (key = "reverse-1", reason = "Duplicate") =>
    db.query(
      "select public.reverse_native_receivable_payment($1,$2,'company','debt','payment',$3,$4,'branch','device') value",
      [actor, org, key, reason],
    );
  // Administrative fixture inspection is deliberately separate from service-role RPC calls.
  const inspect = async (sql, parameters = []) => {
    await db.exec("reset role");
    try {
      return await db.query(sql, parameters);
    } finally {
      await db.exec("set role service_role");
    }
  };
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table auth.users(id uuid primary key,email text,created_at timestamptz default now(),updated_at timestamptz default now());
      create table profiles(id uuid primary key,name text);
      create table tenants(id uuid primary key);
      create table organizations(id uuid primary key,legacy_tenant_id uuid,status text);
      create table access_control_permissions(code text primary key,resource text,action text,description text);
      create table organization_roles(id uuid primary key,organization_id uuid,code text,name text,description text,kind text,status text,version integer default 1,updated_at timestamptz default now());
      create table organization_role_permissions(role_id uuid,permission_code text,primary key(role_id,permission_code));
      create table organization_memberships(id uuid primary key,organization_id uuid,user_id uuid,role_id uuid,role text,status text,version integer default 1,authorization_version integer default 1,updated_at timestamptz default now(),unique(organization_id,user_id));
      create table shared_companies(tenant_id uuid,id text,organization_id uuid,name text,status text default 'active',primary key(tenant_id,id),unique(organization_id,id));
      create table shared_inventory_customers(tenant_id uuid,id text,company_id text,name text,primary key(tenant_id,id));
      create table shared_inventory_sales_invoices(tenant_id uuid,id text,company_id text,customer_id text,status text,payment_terms text,credit_amount numeric,credit_exchange_rate numeric,primary key(tenant_id,id));
      create table shared_inventory_purchase_invoices(tenant_id uuid,id text,company_id text,status text);
      create table shared_inventory_products(tenant_id uuid,id text,company_id text);
      create table shared_employees(tenant_id uuid,id text,company_id text);
      create table shared_payroll_receipts(tenant_id uuid,id text,company_id text);
      create table shared_accounting_entries(tenant_id uuid,id text,company_id text);
      create table shared_sales_receivables(tenant_id uuid,id text,company_id text,customer_id text,sales_invoice_id text,debt_currency_code varchar(3),original_amount numeric,debt_exchange_rate numeric,status text,primary key(tenant_id,id));
      create table shared_sales_receivable_payments(tenant_id uuid,id text default gen_random_uuid()::text,receivable_id text,idempotency_key text,received_amount numeric,received_currency_code varchar(3),applied_debt_amount numeric,exchange_rate_to_ves numeric,rate_effective_date date,rate_source text,payment_method text,reference text,occurred_at timestamptz default now(),primary key(tenant_id,id),unique(tenant_id,idempotency_key));
      create function public.access_control_role_json(uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;
      create function public.organization_actor_has_permission(o uuid,u uuid,p text) returns boolean language sql as $$ select exists(select 1 from organization_memberships m join organization_role_permissions r on r.role_id=m.role_id where m.organization_id=o and m.user_id=u and m.status='active' and r.permission_code=p) $$;
      create function public.shared_inventory_sales_invoice_confirm_attributed(p_tenant uuid,p_invoice text,p_actor uuid,p_negative boolean) returns jsonb language plpgsql security definer set search_path=public as $$
        begin update shared_inventory_sales_invoices set status='confirmada' where tenant_id=p_tenant and id=p_invoice;
        if p_invoice='fail' then raise exception 'SIMULATED_BUSINESS_FAILURE'; end if;
        return jsonb_build_object('id',p_invoice); end $$;
      insert into tenants values('${tenant}');
      insert into auth.users(id,email) values('${actor}','actor@example.test');
      insert into organizations values('${org}','${tenant}','active');
      insert into organization_roles(id,organization_id,code,name,description,kind,status) values('${role}','${org}','seller','Seller','','custom','active');
      insert into organization_memberships(id,organization_id,user_id,role_id,role,status) values('${membership}','${org}','${actor}','${role}','seller','active');
      insert into access_control_permissions values('sales.confirm','sales','confirm',''),('sales.update','sales','update',''),('sales.read','sales','read',''),('roles.manage','roles','manage',''),('members.read','members','read',''),('members.update','members','update','');
      insert into organization_role_permissions values('${role}','sales.confirm'),('${role}','sales.update'),('${role}','sales.read'),('${role}','roles.manage'),('${role}','members.read'),('${role}','members.update');
      insert into shared_companies values('${tenant}','company','${org}','Company','active'),('${tenant}','other','${org}','Other','active');
      insert into shared_inventory_customers values('${tenant}','customer','company','Customer');
      insert into shared_inventory_sales_invoices values('${tenant}','invoice','company','customer','borrador','credito',20,1),('${tenant}','cash','company','customer','borrador','contado',null,null),('${tenant}','fail','company','customer','borrador','contado',null,null);
      insert into shared_sales_receivables values('${tenant}','debt','company','customer','old','VES',100,1,'settled');
      insert into shared_sales_receivable_payments values('${tenant}','payment','debt','original-payment',100,'VES',100,1,current_date,'identity',null,null,now());
    `);
    for (const name of [
      "291_user_security_access.sql",
      "292_operational_audit_trail.sql",
      "294_sales_security_operations.sql",
    ]) {
      await db.exec(
        await readFile(
          new URL(
            `../../../../../supabase/migrations/${name}`,
            import.meta.url,
          ),
          "utf8",
        ),
      );
    }
    await db.query(
      "insert into access_control_permissions values('companies.read','companies','read','') on conflict do nothing",
    );
    await db.query(
      "insert into organization_role_permissions values($1,'companies.read'),($1,'sales.price_lists.use')",
      [role],
    );
    await db.query(
      "insert into organization_membership_scoped_grants(organization_id,membership_id,permission_code,target_kind,target_id,company_id) values($1,$2,'sales.price_lists.use','price_list','default','company')",
      [org, membership],
    );
    await db.exec("set role service_role");
    await t.test(
      "credit ceilings persist under CAS and scoped reads",
      async () => {
        const result = await db.query(
          "select public.set_native_customer_credit_limit($1,$2,'company','customer',10,0) value",
          [actor, org],
        );
        assert.equal(result.rows[0].value.version, 1);
        await assert.rejects(
          db.query(
            "select public.set_native_customer_credit_limit($1,$2,'company','customer',20,0)",
            [actor, org],
          ),
          /SALES_CONCURRENCY_CONFLICT/,
        );
        await assert.rejects(
          db.query(
            "select public.set_native_customer_credit_limit($1,$2,'other','customer',20,0)",
            [actor, org],
          ),
          /SALES_NOT_FOUND/,
        );
        await assert.rejects(
          db.query(
            "select public.set_native_customer_credit_limit($1,$2,'company','customer',0.000000001,1)",
            [actor, org],
          ),
          /SALES_CREDIT_INVALID/,
        );
      },
    );
    await t.test(
      "credit, negative-stock and exact-price grants are required before confirmation",
      async () => {
        await assert.rejects(confirm("invoice"), /ACCESS_DENIED/);
        await assert.rejects(confirm("cash", true), /ACCESS_DENIED/);
        await assert.rejects(
          confirm("cash", false, "wholesale"),
          /ACCESS_DENIED/,
        );
        assert.equal(
          (
            await inspect(
              "select status from shared_inventory_sales_invoices where id='invoice'",
            )
          ).rows[0].status,
          "borrador",
        );
        await inspect(
          "insert into organization_role_permissions values($1,'sales.overdrawn_customer.bill'),($1,'inventory.negative_stock.use')",
          [role],
        );
        await assert.rejects(
          confirm("cash", false, "wholesale"),
          /ACCESS_DENIED/,
        );
        await db.query(
          "select public.organization_scoped_grant_grant($1,$2,$3,'sales.price_lists.use','price_list','wholesale','company')",
          [org, actor, membership],
        );
        assert.equal(
          (await confirm("invoice", true, "wholesale")).rows[0].value.status,
          "confirmed",
        );
        const evidence = await inspect(
          "select actor_id,device_id,branch_id from shared_operational_audit_trail where entity_id='invoice' and action='update'",
        );
        assert.ok(evidence.rows.length > 0);
        assert.equal(evidence.rows[0].actor_id, actor);
        assert.equal(evidence.rows[0].device_id, "device");
      },
    );
    await t.test(
      "omitting a price list still requires the default tier grant",
      async () => {
        await db.query(
          "select public.organization_scoped_grant_revoke($1,$2,$3,'sales.price_lists.use','price_list','default','company')",
          [org, actor, membership],
        );
        await assert.rejects(confirm("cash"), /ACCESS_DENIED/);
        await db.query(
          "select public.organization_scoped_grant_grant($1,$2,$3,'sales.price_lists.use','price_list','default','company')",
          [org, actor, membership],
        );
      },
    );
    await t.test(
      "business failure rolls back both invoice and audit rows",
      async () => {
        await assert.rejects(confirm("fail"), /SIMULATED_BUSINESS_FAILURE/);
        assert.equal(
          (
            await inspect(
              "select status from shared_inventory_sales_invoices where id='fail'",
            )
          ).rows[0].status,
          "borrador",
        );
        assert.equal(
          (
            await inspect(
              "select count(*)::int n from shared_operational_audit_trail where entity_id='fail'",
            )
          ).rows[0].n,
          0,
        );
      },
    );
    await t.test(
      "reversal checks permissions and preserves receipts with exact idempotency",
      async () => {
        await assert.rejects(reverse(), /ACCESS_DENIED/);
        await inspect(
          "insert into organization_role_permissions values($1,'sales.receivable_payments.reverse')",
          [role],
        );
        assert.equal((await reverse()).rows[0].value.replayed, false);
        assert.equal((await reverse()).rows[0].value.replayed, true);
        await assert.rejects(reverse("reverse-2"), /IDEMPOTENCY_CONFLICT/);
        assert.equal(
          (
            await inspect(
              "select count(*)::int n from shared_sales_receivable_payments where id='payment'",
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (
            await inspect(
              "select status from shared_sales_receivables where id='debt'",
            )
          ).rows[0].status,
          "open",
        );
        await assert.rejects(
          db.query("delete from public.shared_sales_payment_reversals"),
          /permission denied/,
        );
      },
    );
    await t.test(
      "a reversed receipt no longer prevents a replacement payment",
      async () => {
        const sql =
          "select public.shared_sales_receivable_apply_payment($1,'debt','replacement',100,'VES',1,current_date,'identity',null,null) value";
        const saved = await db.query(sql, [tenant]);
        assert.equal(saved.rows[0].value.applied_debt_amount, 100);
        assert.equal(
          (await db.query(sql, [tenant])).rows[0].value.id,
          saved.rows[0].value.id,
        );
        await assert.rejects(
          db.query(sql.replace("100,'VES'", "99,'VES'"), [tenant]),
          /IDEMPOTENCY_CONFLICT/,
        );
      },
    );
    await t.test(
      "untrusted database roles cannot call privileged RPCs",
      async () => {
        await db.exec("set role authenticated");
        await assert.rejects(confirm("cash"), /permission denied/);
        await db.exec("set role service_role");
      },
    );
  } finally {
    await db.close();
  }
});
