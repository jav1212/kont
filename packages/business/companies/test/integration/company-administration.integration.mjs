/**
 * Runs migrations 285–288 against disposable embedded PostgreSQL, never Supabase.
 * Supply PGLITE_MODULE_PATH when the optional test runtime is installed externally.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const tenant = "00000000-0000-4000-8000-000000000001";
const organization = "00000000-0000-4000-8000-000000000011";
const otherOrganization = "00000000-0000-4000-8000-000000000012";
const actor = "00000000-0000-4000-8000-000000000021";
const otherActor = "00000000-0000-4000-8000-000000000022";
const role = "00000000-0000-4000-8000-000000000031";
const companyTaxId = "J-12345678-9";
let companyId;

test("company administration persists authorized, isolated, versioned operations", async (t) => {
  const db = new PGlite();
  /** Executes a create with a stable intent, with optional actor/organization overrides. */
  const create = async (key = "create-1", name = "Empresa", taxId = companyTaxId, user = actor, org = organization) => {
    const result = await db.query(
      "select public.create_native_company($1,$2,$3,$4,$5,$6,$7,$8) as value",
      [user, org, key, name, "Comercial", taxId, "VE", "standard"],
    );
    return result.rows[0].value;
  };
  /** Executes a versioned metadata update and returns the authoritative snapshot. */
  const update = async (version, changes, id = companyId, user = actor, org = organization) => {
    const result = await db.query("select public.update_native_company($1,$2,$3,$4,$5::jsonb) as value",
      [user, org, id, version, JSON.stringify(changes)]);
    return result.rows[0].value;
  };
  /** Executes one versioned lifecycle transition. */
  const transition = async (version, status) => {
    const result = await db.query("select public.set_native_company_status($1,$2,$3,$4,$5) as value",
      [actor, organization, companyId, version, status]);
    return result.rows[0].value;
  };
  try {
    // Minimal existing schema models the columns and access tables migration 285
    // depends on; this is not a certification of the complete migration chain.
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table public.tenants(id uuid primary key);
      create table public.organizations(id uuid primary key, legacy_tenant_id uuid references tenants(id), status text not null);
      create table public.organization_roles(id uuid primary key, organization_id uuid,
        status text not null check(status in ('active','archived')));
      create table public.organization_memberships(organization_id uuid, user_id uuid, role_id uuid, status text not null);
      create table public.organization_role_permissions(role_id uuid, permission_code text, primary key(role_id,permission_code));
      create table public.shared_companies(
        tenant_id uuid not null references tenants(id), id text not null, organization_id uuid references organizations(id),
        owner_id text not null, name text not null, rif text, operating_profile text not null default 'standard',
        config_fiscal jsonb not null default '{}', logo_url text,
        proximo_numero_factura_venta integer default 1,
        proximo_numero_nota_entrega integer not null default 1,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
        primary key(tenant_id,id)
      );
      create table public.shared_inventory_sales_invoices(
        tenant_id uuid not null, company_id text not null, invoice_number text not null,
        document_type text not null default 'venta'
      );
      insert into tenants values('${tenant}'),('00000000-0000-4000-8000-000000000002');
      insert into organizations values('${organization}','${tenant}','active'),
        ('${otherOrganization}','00000000-0000-4000-8000-000000000002','active');
      insert into organization_roles values('${role}','${organization}','active'),
        ('00000000-0000-4000-8000-000000000032','${otherOrganization}','active');
      insert into organization_memberships values('${organization}','${actor}','${role}','active'),
        ('${otherOrganization}','${otherActor}','00000000-0000-4000-8000-000000000032','active');
      insert into organization_role_permissions values('${role}','companies.create'),('${role}','companies.update'),
        ('00000000-0000-4000-8000-000000000032','companies.create'),
        ('00000000-0000-4000-8000-000000000032','companies.update');
      insert into shared_companies(tenant_id,id,organization_id,owner_id,name,config_fiscal)
        values('${tenant}','legacy','${organization}','${tenant}','Legacy','{"legacy":true}');
      grant select, insert, update, delete on public.shared_companies to authenticated;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    `);
    await db.exec(await readFile(new URL("../../../../../supabase/migrations/285_company_administration.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../../../../../supabase/migrations/286_company_document_numbering_settings.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../../../../../supabase/migrations/287_company_administration_event_index.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../../../../../supabase/migrations/288_company_document_numbering_exhaustion_guard.sql", import.meta.url), "utf8"));

    await t.test("existing rows receive compatible lifecycle defaults without losing configuration", async () => {
      const { rows } = await db.query("select * from shared_companies where id='legacy'");
      assert.equal(rows[0].status, "active");
      assert.equal(rows[0].version, 1);
      assert.equal(rows[0].country, "VE");
      assert.deepEqual(rows[0].config_fiscal, { legacy: true });
    });
    await t.test("creation is canonical, idempotent and audited exactly once", async () => {
      const first = await create("create-1", " Empresa ", "j123456789");
      companyId = first.id;
      assert.match(first.id, /^[0-9a-f-]{36}$/);
      assert.equal(first.rif, companyTaxId);
      assert.equal(first.name, "Empresa");
      assert.equal(first.version, 1);
      assert.deepEqual(await create(), first);
      const events = await db.query("select * from shared_company_administration_events");
      assert.equal(events.rows.length, 1);
      assert.equal(events.rows[0].actor_user_id, actor);
      await assert.rejects(create("create-1", "Different"), /COMPANY_IDEMPOTENCY_CONFLICT/);
      await assert.rejects(create("new-key"), /COMPANY_ALREADY_EXISTS/);
      const requests = await db.query("select count(*)::int as count from shared_company_creation_requests");
      assert.equal(requests.rows[0].count, 1);
    });
    await t.test("requests submitted together yield one creation receipt", async () => {
      const receipts = await Promise.all([create("parallel", "No RIF", null), create("parallel", "No RIF", null)]);
      assert.deepEqual(receipts[0], receipts[1]);
      assert.match(receipts[0].id, /^[0-9a-f-]{36}$/);
    });
    await t.test("edits roundtrip and stale edits fail without mutation", async () => {
      const changed = await update(1, { legalName: "Nueva", tradeName: null, operatingProfile: "kiosk" });
      assert.equal(changed.version, 2);
      assert.equal(changed.trade_name, null);
      assert.equal(changed.operating_profile, "kiosk");
      await assert.rejects(update(1, { legalName: "Stale" }), /COMPANY_VERSION_CONFLICT/);
      assert.equal((await create()).name, "Empresa", "create replay retains original receipt after later edits");
    });
    await t.test("suspend and reactivate persist with strict transitions and versions", async () => {
      assert.equal((await transition(2, "suspended")).status, "suspended");
      await assert.rejects(transition(3, "suspended"), /COMPANY_TRANSITION_INVALID/);
      await assert.rejects(transition(2, "active"), /COMPANY_VERSION_CONFLICT/);
      const active = await transition(3, "active");
      assert.equal(active.status, "active");
      assert.equal(active.version, 4);
    });
    await t.test("legacy writes advance version and preserve lifecycle and metadata", async () => {
      await db.query("update shared_companies set name='Legacy edit' where tenant_id=$1 and id=$2", [tenant, companyId]);
      await assert.rejects(update(4, { legalName: "Stale" }), /COMPANY_VERSION_CONFLICT/);
      const current = await update(5, { legalName: "Current" });
      assert.equal(current.version, 6);
      assert.equal(current.operating_profile, "kiosk");
    });
    await t.test("document numbering settings serialize with sales counters and cannot rewind", async () => {
      const initial = await db.query("select public.get_native_company_document_numbering($1,$2,$3,$4) as value", [actor, organization, companyId, 6]);
      assert.deepEqual(initial.rows[0].value, {
        sales_invoice_next_number: 1,
        delivery_note_next_number: 1,
        company_version: 6,
      });
      const changed = await db.query("select public.update_native_company_document_numbering($1,$2,$3,$4,$5,$6) as value", [actor, organization, companyId, 6, 15, 7]);
      assert.deepEqual(changed.rows[0].value, {
        sales_invoice_next_number: 15,
        delivery_note_next_number: 7,
        company_version: 7,
      });
      const audit = await db.query("select action, previous_version, version from shared_company_administration_events where company_id=$1 order by occurred_at desc limit 1", [companyId]);
      assert.deepEqual(audit.rows[0], { action: "document_numbering_updated", previous_version: 6, version: 7 });
      for (const values of [[100000000, null], [null, 100000000]]) {
        await assert.rejects(
          db.query("select public.update_native_company_document_numbering($1,$2,$3,$4,$5,$6)", [actor, organization, companyId, 7, ...values]),
          /COMPANY_DOCUMENT_NUMBER_INVALID/,
        );
      }
      await db.query("insert into shared_inventory_sales_invoices values($1,$2,'00000019','venta')", [tenant, companyId]);
      await assert.rejects(
        db.query("select public.update_native_company_document_numbering($1,$2,$3,$4,$5,$6)", [actor, organization, companyId, 7, 19, null]),
        /COMPANY_DOCUMENT_NUMBER_IN_USE/,
      );
      await assert.rejects(
        db.query("select public.update_native_company_document_numbering($1,$2,$3,$4,$5,$6)", [actor, organization, companyId, 7, 14, null]),
        /COMPANY_DOCUMENT_NUMBER_REWIND/,
      );
      await db.query("update shared_companies set proximo_numero_factura_venta=16 where tenant_id=$1 and id=$2", [tenant, companyId]);
      await assert.rejects(
        db.query("select public.update_native_company_document_numbering($1,$2,$3,$4,$5,$6)", [actor, organization, companyId, 7, 20, null]),
        /COMPANY_VERSION_CONFLICT/,
      );
      const final = await db.query("select proximo_numero_factura_venta, proximo_numero_nota_entrega, version from shared_companies where tenant_id=$1 and id=$2", [tenant, companyId]);
      assert.deepEqual(final.rows[0], { proximo_numero_factura_venta: 16, proximo_numero_nota_entrega: 7, version: 8 });
    });
    await t.test("not found and cross-organization mutations cannot write", async () => {
      await assert.rejects(update(1, { legalName: "Missing" }, "absent"), /COMPANY_NOT_FOUND/);
      await assert.rejects(update(6, { legalName: "Foreign" }, companyId, otherActor), /COMPANY_ACCESS_DENIED/);
      await assert.rejects(update(6, { legalName: "Foreign" }, companyId, otherActor, otherOrganization), /COMPANY_NOT_FOUND/);
      const other = await create("create-1", "Other", companyTaxId, otherActor, otherOrganization);
      assert.equal(other.organization_id, otherOrganization, "same RIF can exist in a different organization");
      assert.notEqual(other.id, companyId);
    });
    await t.test("inactive organizations, roles and memberships and missing grants deny writes", async () => {
      for (const table of ["organizations", "organization_roles", "organization_memberships"]) {
        const where = table === "organizations" ? `id='${organization}'` : `organization_id='${organization}'`;
        const inactive = table === "organization_roles" ? "archived" : "suspended";
        await db.exec(`update ${table} set status='${inactive}' where ${where}`);
        await assert.rejects(update(6, { legalName: "Denied" }), /COMPANY_ACCESS_DENIED/);
        await assert.rejects(create(), /COMPANY_ACCESS_DENIED/);
        await db.exec(`update ${table} set status='active' where ${where}`);
      }
      await db.exec(`delete from organization_role_permissions where role_id='${role}' and permission_code='companies.update'`);
      await assert.rejects(update(6, { legalName: "Denied" }), /COMPANY_ACCESS_DENIED/);
      await db.exec(`insert into organization_role_permissions values('${role}','companies.update')`);
    });
    await t.test("unprovisioned organizations fail explicitly", async () => {
      await db.exec(`update organizations set legacy_tenant_id=null where id='${organization}'`);
      await assert.rejects(create("unprovisioned", "New", null), /COMPANY_ORGANIZATION_NOT_READY/);
      await db.exec(`update organizations set legacy_tenant_id='${tenant}' where id='${organization}'`);
    });
    await t.test("RIF corrections preserve IDs and release the former identifier", async () => {
      const candidate = await create("tax-correction", "Correction", "J-11111111-1");
      const changed = await update(1, { taxId: "J-22222222-2" }, candidate.id);
      assert.equal(changed.id, candidate.id);
      const reused = await create("tax-reuse", "Reuse", "J-11111111-1");
      assert.notEqual(reused.id, candidate.id);
      await assert.rejects(update(1, { taxId: "J-22222222-2" }, reused.id), /COMPANY_ALREADY_EXISTS/);
    });
    await t.test("historical duplicate RIFs remain editable without creating more duplicates", async () => {
      await db.query(`insert into shared_companies(tenant_id,id,organization_id,owner_id,name,rif)
        values($1,'duplicate-1',$2,$3,'Legacy one','J555555555'),
        ($1,'duplicate-2',$2,$3,'Legacy two','J-55555555-5')`, [tenant, organization, tenant]);
      const kept = await update(1, { legalName: "Corrected name", taxId: "J-55555555-5" }, "duplicate-1");
      assert.equal(kept.version, 2);
      assert.equal(kept.id, "duplicate-1");
      await assert.rejects(create("duplicate-rif", "New duplicate", "J-55555555-5"), /COMPANY_ALREADY_EXISTS/);
    });
    await t.test("invalid or unknown fields and lifecycle bypasses are rejected", async () => {
      const current = await db.query("select version from shared_companies where tenant_id=$1 and id=$2", [tenant, companyId]);
      const version = current.rows[0].version;
      for (const changes of [{}, { status: "suspended" }, { legalName: null }, { operatingProfile: null },
        { legalName: " " }, { tradeName: 2 }, { taxId: "invalid" }, { unexpected: true }]) {
        await assert.rejects(update(version, changes), /COMPANY_INVALID/);
      }
      await assert.rejects(transition(version, "archived"), /COMPANY_INVALID/);
      const archived = await db.query("update shared_companies set status='archived' where tenant_id=$1 and id=$2 returning version", [tenant, companyId]);
      await assert.rejects(update(archived.rows[0].version, { legalName: "Archived" }), /COMPANY_TRANSITION_INVALID/);
    });
    await t.test("RPCs and administration records are inaccessible to untrusted database roles", async () => {
      const privileges = await db.query(`select
        has_function_privilege('authenticated','public.create_native_company(uuid,uuid,text,text,text,text,text,text)','execute') as authenticated,
        has_function_privilege('anon','public.update_native_company(uuid,uuid,text,integer,jsonb)','execute') as anon,
        has_function_privilege('service_role','public.set_native_company_status(uuid,uuid,text,integer,text)','execute') as service,
        has_table_privilege('authenticated','public.shared_company_creation_requests','select') as records,
        has_table_privilege('authenticated','public.shared_companies','update') as legacy_write_preserved`);
      assert.deepEqual(privileges.rows[0], { authenticated: false, anon: false, service: true, records: false,
        legacy_write_preserved: true });
    });
  } finally {
    await db.close();
  }
});
