/** Validates migration 363 against disposable embedded PostgreSQL without contacting Supabase. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const tenant = "00000000-0000-4000-8000-000000000001";
const organization = "00000000-0000-4000-8000-000000000011";
const actor = "00000000-0000-4000-8000-000000000021";

test("fiscal configuration copy persists selected settings without transferring identity", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema extensions;
      -- PGlite omits pgcrypto; this deterministic test double exercises request replay only.
      create function extensions.digest(text,text) returns bytea language sql immutable
        as $$ select decode(md5($1)||md5($1),'hex') $$;
      create table public.organizations(id uuid primary key, tenant_id uuid not null);
      insert into public.organizations values ('${organization}','${tenant}');
      create table public.shared_companies(
        tenant_id uuid not null, organization_id uuid not null references public.organizations(id),
        id text not null, name text not null, trade_name text, rif text,
        country text not null default 'VE', person_nature text, status text not null default 'active',
        version integer not null default 1, operating_profile text not null default 'standard',
        address text, taxpayer_type text not null default 'ordinario',
        updated_at timestamptz not null default now(), primary key(tenant_id,id)
      );
      create function public.advance_shared_company_version() returns trigger language plpgsql as $$
        begin new.version:=old.version+1; new.updated_at:=now(); return new; end; $$;
      create trigger shared_companies_advance_version before update on public.shared_companies
        for each row execute function public.advance_shared_company_version();
      create table public.shared_company_date_formats(
        organization_id uuid, tenant_id uuid, company_id text, format_version integer, date_order text);
      create table public.shared_company_monetary_policies(
        organization_id uuid, tenant_id uuid, company_id text, policy_version integer, reference_currency_codes text[]);
      create function public.assert_user_security_access(uuid,uuid,text,text) returns uuid
        language sql stable as $$ select tenant_id from public.organizations where id=$2 $$;
      create function public.assert_company_administration_access(uuid,uuid,text) returns uuid
        language sql stable as $$ select tenant_id from public.organizations where id=$1 $$;
      create function public.company_administration_snapshot(public.shared_companies) returns jsonb
        language sql stable as $$ select jsonb_build_object(
          'id',$1.id,'organization_id',$1.organization_id,'name',$1.name,
          'trade_name',$1.trade_name,'rif',$1.rif,'country',$1.country,
          'person_nature',$1.person_nature,'status',$1.status,
          'operating_profile',$1.operating_profile,'version',$1.version) $$;
      create function public.create_native_company_with_person_nature(
        uuid,uuid,text,text,text,text,text,text,text) returns jsonb
        language plpgsql as $$ declare c public.shared_companies%rowtype; begin
          insert into public.shared_companies(tenant_id,organization_id,id,name,trade_name,rif,country,operating_profile,person_nature)
          values('${tenant}',$2,gen_random_uuid()::text,btrim($4),$5,$6,$7,$8,$9) returning * into c;
          return public.company_administration_snapshot(c);
        end; $$;
    `);
    const base = new URL("../../../../../supabase/migrations/", import.meta.url);
    const original = await readFile(new URL("324_company_configuration_copy.sql", base), "utf8");
    await db.exec(original.split("create or replace function public.company_configuration_copy_sections_valid")[0]);
    await db.exec(await readFile(new URL("333_company_fiscal_profile_adm_025.sql", base), "utf8"));
    await db.exec(await readFile(new URL("363_company_configuration_copy_fiscal_settings.sql", base), "utf8"));
    await db.exec(`
      insert into public.shared_companies(tenant_id,organization_id,id,name,rif,person_nature,operating_profile)
      values('${tenant}','${organization}','source','Source','J-12345678-9','juridical','kiosk'),
            ('${tenant}','${organization}','destination','Destination',null,'natural','standard'),
            ('${tenant}','${organization}','mixed','Mixed',null,'natural','standard');
    `);
    await db.query("select public.configure_native_company_fiscal_profile($1,$2,'source',1,'source-fiscal','Source setup','Caracas','especial')", [actor, organization]);

    const copy = async (destination, version, key, sections) => (await db.query(
      "select public.copy_native_company_configuration($1,$2,'source',2,$3,$4,null,null,null,null,$5,$6::jsonb) as receipt",
      [actor, organization, destination, version, key, JSON.stringify(sections)],
    )).rows[0].receipt;
    const first = await copy("destination", 1, "copy-fiscal", ["fiscal_profile"]);
    assert.deepEqual(first.copied_sections, ["fiscal_profile"]);
    assert.deepEqual(await copy("destination", 1, "copy-fiscal", ["fiscal_profile"]), first);
    const destination = (await db.query("select name,rif,person_nature,address,taxpayer_type,version from public.shared_companies where id='destination'")).rows[0];
    assert.deepEqual(destination, {
      name: "Destination", rif: null, person_nature: "natural", address: "Caracas", taxpayer_type: "especial", version: 2,
    });
    await assert.rejects(() => copy("destination", 1, "copy-fiscal", ["operating_profile"]), /COMPANY_CONFIGURATION_COPY_IDEMPOTENCY_CONFLICT/);

    const mixed = await copy("mixed", 1, "copy-mixed", ["operating_profile", "fiscal_profile"]);
    assert.equal(mixed.company.version, 3);
    assert.equal(mixed.company.operating_profile, "kiosk");
    const unchanged = await copy("mixed", 3, "copy-unchanged", ["fiscal_profile"]);
    assert.equal(unchanged.company.version, 3);
    assert.equal((await db.query("select count(*)::integer as count from public.shared_company_fiscal_profile_events where company_id='mixed'")).rows[0].count, 1);

    const target = { legalName: "Created", tradeName: null, taxId: null, country: "VE", personNature: "natural" };
    const create = async () => (await db.query(
      "select public.create_native_company_from_existing($1,$2,'source',2,null,null,'create-fiscal',$3::jsonb,$4::jsonb) as receipt",
      [actor, organization, JSON.stringify(["fiscal_profile"]), JSON.stringify(target)],
    )).rows[0].receipt;
    const created = await create();
    assert.deepEqual(await create(), created);
    assert.equal(created.company.version, 2);
    const createdRow = (await db.query("select name,rif,person_nature,address,taxpayer_type from public.shared_companies where id=$1", [created.company.id])).rows[0];
    assert.deepEqual(createdRow, { name: "Created", rif: null, person_nature: "natural", address: "Caracas", taxpayer_type: "especial" });
    assert.equal((await db.query("select count(*)::integer as count from public.shared_company_configuration_copy_events where copied_sections ? 'fiscal_profile'")).rows[0].count, 4);
  } finally {
    await db.close();
  }
});
