/**
 * Runs the Web-security SQL migrations against an isolated PGlite fixture.
 * Set PGLITE_MODULE_PATH when PGlite is installed outside this workspace.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const db = new PGlite();

const tenantA = "00000000-0000-4000-8000-000000000001";
const tenantB = "00000000-0000-4000-8000-000000000002";
const organizationA = "00000000-0000-4000-8000-000000000011";
const organizationB = "00000000-0000-4000-8000-000000000012";
const owner = "00000000-0000-4000-8000-000000000021";
const member = "00000000-0000-4000-8000-000000000022";
const outsider = "00000000-0000-4000-8000-000000000023";

/** Executes one migration with its filename in failures. */
async function migrate(name) {
  try {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
  } catch (error) {
    throw new Error(`${name}: ${error.message}`);
  }
}

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), encrypted_password text);
    CREATE TABLE public.tenants (id uuid PRIMARY KEY);
    CREATE TABLE public.organizations (id uuid PRIMARY KEY, legacy_tenant_id uuid UNIQUE NOT NULL, status text NOT NULL);
    CREATE TABLE public.shared_companies (tenant_id uuid NOT NULL, id text NOT NULL, organization_id uuid NOT NULL, status text NOT NULL DEFAULT 'active', PRIMARY KEY (tenant_id,id));
    CREATE TABLE public.access_control_permissions (code text PRIMARY KEY);
    CREATE TABLE public.organization_roles (id uuid PRIMARY KEY, organization_id uuid NOT NULL, code text NOT NULL, status text NOT NULL);
    CREATE TABLE public.organization_role_permissions (role_id uuid NOT NULL, permission_code text NOT NULL, PRIMARY KEY(role_id,permission_code));
    CREATE TABLE public.organization_memberships (id uuid PRIMARY KEY, organization_id uuid NOT NULL, user_id uuid NOT NULL, role_id uuid NOT NULL, status text NOT NULL);
    CREATE TABLE public.organization_user_security (organization_id uuid NOT NULL, user_id uuid NOT NULL, PRIMARY KEY(organization_id,user_id));
    CREATE TABLE public.organization_user_allowed_companies (organization_id uuid NOT NULL, user_id uuid NOT NULL, company_id text NOT NULL, PRIMARY KEY(organization_id,user_id,company_id));
    CREATE TABLE public.organization_membership_scoped_grants (organization_id uuid NOT NULL, membership_id uuid NOT NULL, permission_code text NOT NULL, target_kind text NOT NULL, target_id text NOT NULL, company_id text NOT NULL DEFAULT '');
    CREATE TABLE public.account_security_policies (organization_id uuid PRIMARY KEY, password_maximum_age_days integer, inactivity_maximum_days integer, failed_attempt_limit integer NOT NULL DEFAULT 5, failed_attempt_window_minutes integer NOT NULL DEFAULT 15, lockout_minutes integer NOT NULL DEFAULT 15, version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.account_security_states (organization_id uuid NOT NULL, user_id uuid NOT NULL, password_changed_at timestamptz NOT NULL, last_authenticated_at timestamptz NOT NULL, failed_attempts timestamptz[] NOT NULL DEFAULT '{}', locked_until timestamptz, version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(organization_id,user_id));
    CREATE TABLE public.shared_payment_orders (tenant_id uuid NOT NULL, id text NOT NULL, company_id text NOT NULL, beneficiary text NOT NULL, concept text NOT NULL, amount numeric(28,8) NOT NULL, currency varchar(3) NOT NULL, due_date date, status text NOT NULL, version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,id));
    CREATE TABLE public.shared_operational_audit_trail (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, organization_id uuid NOT NULL, company_id text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL, action text NOT NULL, actor_id uuid, occurred_at timestamptz NOT NULL, branch_id text, device_id text, before_snapshot jsonb, after_snapshot jsonb, changes jsonb NOT NULL);
    CREATE TABLE public.shared_sales_payment_reversals (tenant_id uuid NOT NULL, id text NOT NULL, payment_id text NOT NULL);
    CREATE TABLE public.shared_sales_receivable_payments (tenant_id uuid NOT NULL, id text NOT NULL, receivable_id text NOT NULL);
    CREATE TABLE public.shared_sales_receivables (tenant_id uuid NOT NULL, id text NOT NULL, company_id text NOT NULL);
    CREATE FUNCTION public.operational_audit_snapshot(value jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT value $$;
    CREATE FUNCTION public.operational_audit_changes(before_value jsonb, after_value jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT '[]'::jsonb $$;
    CREATE FUNCTION public.payment_order_json(p_tenant_id uuid,p_organization_id uuid,p_company_id text,p_id text) RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT jsonb_build_object('id',o.id,'tenant_id',o.tenant_id,'organization_id',c.organization_id,'company_id',o.company_id,'beneficiary',o.beneficiary,'concept',o.concept,'amount',o.amount::text,'currency',o.currency,'due_date',o.due_date,'status',o.status,'version',o.version)
      FROM public.shared_payment_orders o JOIN public.shared_companies c ON c.tenant_id=o.tenant_id AND c.id=o.company_id
      WHERE o.tenant_id=p_tenant_id AND c.organization_id=p_organization_id AND o.company_id=p_company_id AND o.id=p_id $$;
    CREATE FUNCTION public.assert_user_security_access(p_actor_user_id uuid,p_organization_id uuid,p_company_id text DEFAULT NULL,p_permission text DEFAULT 'members.update') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
    DECLARE tenant uuid;
    BEGIN
      SELECT o.legacy_tenant_id INTO tenant FROM public.organizations o JOIN public.organization_memberships m ON m.organization_id=o.id JOIN public.organization_roles r ON r.id=m.role_id AND r.organization_id=o.id JOIN public.organization_role_permissions rp ON rp.role_id=r.id
      WHERE o.id=p_organization_id AND o.status='active' AND m.user_id=p_actor_user_id AND m.status='active' AND r.status='active' AND rp.permission_code=p_permission;
      IF NOT FOUND THEN RAISE EXCEPTION 'ORGANIZATIONAL_USER_ACCESS_DENIED'; END IF;
      IF p_company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.shared_companies c WHERE c.organization_id=p_organization_id AND c.id=p_company_id) THEN RAISE EXCEPTION 'ORGANIZATIONAL_USER_COMPANY_INVALID'; END IF;
      IF p_company_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.organization_user_security s WHERE s.organization_id=p_organization_id AND s.user_id=p_actor_user_id) AND NOT EXISTS (SELECT 1 FROM public.organization_user_allowed_companies a WHERE a.organization_id=p_organization_id AND a.user_id=p_actor_user_id AND a.company_id=p_company_id) THEN RAISE EXCEPTION 'ORGANIZATIONAL_USER_ACCESS_DENIED'; END IF;
      RETURN tenant;
    END $$;
  `);
  await db.query("INSERT INTO auth.users(id,email) VALUES($1,'owner@example.test'),($2,'member@example.test'),($3,'member@example.test')", [owner, member, outsider]);
  await db.query("INSERT INTO public.tenants VALUES($1),($2)", [tenantA, tenantB]);
  await db.query("INSERT INTO public.organizations VALUES($1,$2,'active'),($3,$4,'suspended')", [organizationA, tenantA, organizationB, tenantB]);
  await db.query("INSERT INTO public.shared_companies(tenant_id,id,organization_id) VALUES($1,'all-a',$2),($1,'all-b',$2),($3,'other',$4)", [tenantA, organizationA, tenantB, organizationB]);
  await db.exec(`
    INSERT INTO public.access_control_permissions VALUES ('payment_orders.read'),('companies.read'),('roles.manage');
    INSERT INTO public.organization_roles VALUES
      ('00000000-0000-4000-8000-000000000031','${organizationA}','owner','active'),
      ('00000000-0000-4000-8000-000000000032','${organizationA}','member','active');
    INSERT INTO public.organization_role_permissions SELECT '00000000-0000-4000-8000-000000000031',code FROM public.access_control_permissions;
    INSERT INTO public.organization_role_permissions VALUES ('00000000-0000-4000-8000-000000000032','payment_orders.read'),('00000000-0000-4000-8000-000000000032','companies.read');
    INSERT INTO public.organization_memberships VALUES
      ('00000000-0000-4000-8000-000000000041','${organizationA}','${owner}','00000000-0000-4000-8000-000000000031','active'),
      ('00000000-0000-4000-8000-000000000042','${organizationA}','${member}','00000000-0000-4000-8000-000000000032','active');
    INSERT INTO public.shared_payment_orders VALUES
      ('${tenantA}','late','all-a','Proveedor','Primera','12.34000000','VES',NULL,'draft',1,now()),
      ('${tenantA}','early','all-a','Proveedor','Anterior','2.00000000','USD','2026-10-01','cancelled',2,now()-interval '1 day'),
      ('${tenantA}','other-company','all-b','Proveedor','Otra','9.00000000','VES',NULL,'draft',1,now());
  `);

  for (const migration of ["311_security_web_queries.sql", "312_web_security_scope.sql", "313_web_operational_audit_context.sql", "314_account_security_login_organizations.sql"]) await migrate(migration);
  await db.exec(`
    CREATE TABLE public.shared_inventory_customers (tenant_id uuid NOT NULL, company_id text NOT NULL, id text NOT NULL, PRIMARY KEY(tenant_id,id));
    CREATE TABLE public.shared_customer_credit_limits (tenant_id uuid NOT NULL, company_id text NOT NULL, customer_id text NOT NULL, limit_ves numeric NOT NULL, PRIMARY KEY(tenant_id,company_id,customer_id));
    CREATE TABLE public.shared_inventory_sales_invoices (tenant_id uuid NOT NULL, company_id text NOT NULL, id text NOT NULL, status text NOT NULL, customer_id text NOT NULL, payment_terms text NOT NULL, credit_amount numeric, credit_exchange_rate numeric, security_price_list_id text, PRIMARY KEY(tenant_id,id));
    ALTER TABLE public.shared_sales_receivables ADD COLUMN customer_id text;
    ALTER TABLE public.shared_sales_receivables ADD COLUMN original_amount numeric;
    ALTER TABLE public.shared_sales_receivables ADD COLUMN debt_exchange_rate numeric;
    ALTER TABLE public.shared_sales_receivables ADD COLUMN status text;
    ALTER TABLE public.shared_sales_receivable_payments ADD COLUMN applied_debt_amount numeric;
    CREATE OR REPLACE FUNCTION public.organization_scoped_grant_has(p_actor uuid,p_organization uuid,p_company text,p_permission text,p_kind text,p_target text) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM public.organization_memberships m JOIN public.organization_membership_scoped_grants g ON g.membership_id=m.id WHERE m.organization_id=p_organization AND m.user_id=p_actor AND m.status='active' AND g.permission_code=p_permission AND g.target_kind=p_kind AND g.target_id=p_target AND g.company_id=coalesce(p_company,'')) $$;
    CREATE FUNCTION public.set_operational_audit_context(uuid,uuid,text,text,text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    CREATE FUNCTION public.shared_inventory_sales_invoice_confirm_with_register(uuid,text,uuid,boolean,text) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN UPDATE public.shared_inventory_sales_invoices SET status='confirmada' WHERE tenant_id=$1 AND id=$2; RETURN jsonb_build_object('register',$5); END $$;
    INSERT INTO public.access_control_permissions VALUES ('sales.confirm'),('inventory.negative_stock.use'),('sales.overdrawn_customer.bill'),('sales.price_lists.use');
    INSERT INTO public.organization_role_permissions VALUES ('00000000-0000-4000-8000-000000000031','sales.confirm');
    INSERT INTO public.shared_inventory_customers VALUES ('${tenantA}','all-a','customer');
  `);
  await migrate("315_web_sales_security_compatibility.sql");

  // Legacy members see every organization company until their security row is configured.
  let scope = (await db.query("SELECT public.web_user_security_scope($1,$2,true) AS value", [member, organizationA])).rows[0].value;
  assert.equal(scope.allowedCompanyIds, null);
  let page = (await db.query("SELECT public.list_payment_orders($1,$2,'all-a',0,1) AS value", [member, organizationA])).rows[0].value;
  assert.equal(page.total, 2);
  assert.equal(page.orders.length, 1);
  assert.equal(page.orders[0].amount, "12.34000000");
  assert.equal(page.orders[0].organization_id, organizationA);
  await assert.rejects(db.query("SELECT public.list_payment_orders($1,$2,'all-a',-1,1)", [member, organizationA]), /PAYMENT_ORDER_INVALID/);
  await assert.rejects(db.query("SELECT public.list_payment_orders($1,$2,'other',0,50)", [member, organizationA]), /COMPANY_INVALID/);

  // Configuring an empty allow-list is restrictive, not an accidental fallback to legacy all-companies access.
  await db.query("INSERT INTO public.organization_user_security VALUES($1,$2)", [organizationA, member]);
  scope = (await db.query("SELECT public.web_user_security_scope($1,$2,true) AS value", [member, organizationA])).rows[0].value;
  assert.deepEqual(scope.allowedCompanyIds, []);
  await assert.rejects(db.query("SELECT public.list_payment_orders($1,$2,'all-a',0,50)", [member, organizationA]), /ACCESS_DENIED/);
  await db.query("INSERT INTO public.organization_user_allowed_companies VALUES($1,$2,'all-a')", [organizationA, member]);
  assert.equal((await db.query("SELECT public.list_payment_orders($1,$2,'all-a',0,50) AS value", [member, organizationA])).rows[0].value.total, 2);

  // Policies remain after their final concrete grant disappears, and inactive members never receive scope.
  await db.exec("INSERT INTO public.organization_membership_scoped_grants VALUES ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000042','payment_orders.read','table','orders','all-a')");
  await db.exec("DELETE FROM public.organization_membership_scoped_grants WHERE membership_id='00000000-0000-4000-8000-000000000042'");
  scope = (await db.query("SELECT public.web_user_security_scope($1,$2,false) AS value", [member, organizationA])).rows[0].value;
  assert.deepEqual(scope.grants, []);
  assert.deepEqual(scope.policies, [{ permission: "payment_orders.read", kind: "table", companyId: "all-a" }]);
  await db.query("UPDATE public.organization_memberships SET status='suspended' WHERE user_id=$1", [member]);
  await assert.rejects(db.query("SELECT public.web_user_security_scope($1,$2,false)", [member, organizationA]), /ACCESS_DENIED/);
  await db.query("UPDATE public.organization_memberships SET status='active' WHERE user_id=$1", [member]);

  // Password age, inactivity, and lockout block credential sessions but not a separately trusted non-credential session.
  await db.exec(`INSERT INTO public.account_security_policies(organization_id,password_maximum_age_days,inactivity_maximum_days) VALUES ('${organizationA}',1,1);
    INSERT INTO public.account_security_states(organization_id,user_id,password_changed_at,last_authenticated_at) VALUES ('${organizationA}','${member}',clock_timestamp()-interval '2 days',clock_timestamp());`);
  await assert.rejects(db.query("SELECT public.web_user_security_scope($1,$2,true)", [member, organizationA]), /ACCOUNT_SECURITY_DENIED/);
  assert.equal((await db.query("SELECT public.web_user_security_scope($1,$2,false) AS value", [member, organizationA])).rows[0].value.tenantId, tenantA);
  await db.exec(`UPDATE public.account_security_states SET password_changed_at=clock_timestamp(),last_authenticated_at=clock_timestamp()-interval '2 days' WHERE organization_id='${organizationA}' AND user_id='${member}'`);
  await assert.rejects(db.query("SELECT public.web_user_security_scope($1,$2,true)", [member, organizationA]), /ACCOUNT_SECURITY_DENIED/);
  await db.exec(`UPDATE public.account_security_states SET last_authenticated_at=clock_timestamp(),locked_until=clock_timestamp()+interval '1 hour' WHERE organization_id='${organizationA}' AND user_id='${member}'`);
  await assert.rejects(db.query("SELECT public.web_user_security_scope($1,$2,true)", [member, organizationA]), /ACCOUNT_SECURITY_DENIED/);

  // The Web sales wrapper preserves the legacy default tier only before that
  // category is configured, while keeping stock and credit checks server-side.
  await db.exec(`INSERT INTO public.shared_inventory_sales_invoices VALUES
    ('${tenantA}','all-a','cash','borrador','customer','contado',NULL,NULL,NULL),
    ('${tenantA}','all-a','negative','borrador','customer','contado',NULL,NULL,NULL),
    ('${tenantA}','all-a','credit','borrador','customer','credito',10,1,NULL),
    ('${tenantA}','all-a','restricted-default','borrador','customer','contado',NULL,NULL,NULL)`);
  assert.equal((await db.query("SELECT public.confirm_web_sales_invoice_secure($1,$2,'all-a','cash',false,NULL,NULL,NULL,'register') AS value", [owner, organizationA])).rows[0].value.status, "confirmed");
  await assert.rejects(db.query("SELECT public.confirm_web_sales_invoice_secure($1,$2,'all-a','negative',true,NULL,NULL,NULL,NULL)", [owner, organizationA]), /ACCESS_DENIED/);
  await db.exec(`INSERT INTO public.shared_customer_credit_limits VALUES ('${tenantA}','all-a','customer',5)`);
  await assert.rejects(db.query("SELECT public.confirm_web_sales_invoice_secure($1,$2,'all-a','credit',false,NULL,NULL,NULL,NULL)", [owner, organizationA]), /ACCESS_DENIED/);
  await db.exec("INSERT INTO public.organization_role_permissions VALUES ('00000000-0000-4000-8000-000000000031','sales.price_lists.use')");
  // The retained category policy now forces an exact grant. No grant exists,
  // which models the state after its final grant has been revoked.
  await db.exec("INSERT INTO public.organization_scoped_grant_policies VALUES ('00000000-0000-4000-8000-000000000041','sales.price_lists.use','price_list','all-a')");
  await assert.rejects(db.query("SELECT public.confirm_web_sales_invoice_secure($1,$2,'all-a','restricted-default',false,NULL,NULL,NULL,NULL)", [owner, organizationA]), /ACCESS_DENIED/);

  // Service-only audit headers attribute a server-verified actor and reject a tenant mismatch before writing a fact.
  await db.exec("CREATE TABLE public.web_audited_records (tenant_id uuid NOT NULL, company_id text NOT NULL, id text NOT NULL PRIMARY KEY, value text)");
  await db.exec("CREATE TRIGGER web_audit AFTER INSERT OR UPDATE OR DELETE ON public.web_audited_records FOR EACH ROW EXECUTE FUNCTION public.append_operational_audit_trigger('invoice','direct')");
  await db.exec("GRANT INSERT ON public.web_audited_records TO service_role");
  await db.exec("SET ROLE service_role");
  await db.query("SELECT set_config('request.headers',$1,false)", [JSON.stringify({ "x-kontave-audit-actor": owner, "x-kontave-audit-tenant": tenantA, "x-kontave-audit-permission": "companies.read", "x-kontave-audit-device": "web-fixture" })]);
  await db.query("INSERT INTO public.web_audited_records VALUES($1,'all-a','audit-ok','value')", [tenantA]);
  await db.exec("RESET ROLE");
  const audit = (await db.query("SELECT actor_id,device_id FROM public.shared_operational_audit_trail WHERE entity_id='audit-ok'")).rows[0];
  assert.deepEqual(audit, { actor_id: owner, device_id: "web-fixture" });
  await db.exec("SET ROLE service_role");
  await db.query("SELECT set_config('request.headers',$1,false)", [JSON.stringify({ "x-kontave-audit-actor": owner, "x-kontave-audit-tenant": tenantB })]);
  await assert.rejects(db.query("INSERT INTO public.web_audited_records VALUES($1,'all-a','audit-bad','value')", [tenantA]), /CONTEXT_SCOPE_INVALID/);
  await db.exec("RESET ROLE");
  assert.equal((await db.query("SELECT count(*)::int AS count FROM public.shared_operational_audit_trail WHERE entity_id='audit-bad'")).rows[0].count, 0);

  // Recovery lookup exposes only active organization memberships and stays server-only.
  assert.deepEqual((await db.query("SELECT public.account_security_list_active_organizations_for_email(' MEMBER@example.test ') AS value")).rows[0].value, [organizationA]);
  for (const signature of [
    "public.list_payment_orders(uuid,uuid,text,integer,integer)", "public.list_organization_scoped_grants(uuid,uuid,uuid)",
    "public.web_user_security_scope(uuid,uuid,boolean)", "public.account_security_list_active_organizations_for_email(text)",
    "public.confirm_web_sales_invoice_secure(uuid,uuid,text,text,boolean,text,text,text,text)", "public.confirm_native_sales_invoice_secure(uuid,uuid,text,text,boolean,text,text,text)",
  ]) assert.equal((await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') AS allowed", [signature])).rows[0].allowed, false, `${signature} must deny anon`);
  console.log("PASS: Web payment pagination and scope, configured-empty company isolation, active membership, retained scoped policies, credential lock/age/inactivity, sales default-tier/stock/credit/revoked-category guards, trusted audit headers, tenant-mismatch rejection, recovery organization filtering, and anon RPC denial.");
} catch (error) {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
