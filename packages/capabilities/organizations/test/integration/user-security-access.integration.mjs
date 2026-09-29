/** Runs migration 291 in disposable embedded PostgreSQL; it never contacts Supabase. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const organization = "00000000-0000-4000-8000-000000000001";
const actor = "00000000-0000-4000-8000-000000000002";
const member = "00000000-0000-4000-8000-000000000003";
const role = "00000000-0000-4000-8000-000000000004";
const membership = "00000000-0000-4000-8000-000000000005";

test("migration 291 persists isolated user security and exact scoped grants", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth; create role anon; create role authenticated; create role service_role bypassrls;
      create table auth.users(id uuid primary key,email text not null);
      create table public.profiles(id uuid primary key,name text);
      create table public.organizations(id uuid primary key,legacy_tenant_id uuid,status text not null);
      create table public.access_control_permissions(code text primary key,resource text not null,action text not null,description text not null,created_at timestamptz default now());
      create table public.organization_roles(id uuid primary key,organization_id uuid,code text not null,name text default 'role',description text default '',kind text default 'custom',status text not null,version integer default 1,updated_at timestamptz default now());
      create table public.organization_role_permissions(role_id uuid not null,permission_code text not null,primary key(role_id,permission_code));
      create table public.organization_memberships(id uuid primary key default gen_random_uuid(),organization_id uuid not null,user_id uuid not null,role_id uuid not null,role text default 'admin',status text not null,version integer default 1,authorization_version integer default 1,updated_at timestamptz default now(),unique(organization_id,user_id));
      create table public.shared_companies(organization_id uuid not null,id text not null,name text default 'Empresa',primary key(organization_id,id));
      insert into auth.users values('${actor}','actor@example.test'),('${member}','member@example.test');
      insert into public.organizations values('${organization}',null,'active');
      insert into public.organization_roles values('${role}','${organization}','admin','Admin','','custom','active',1,now());
      insert into public.organization_memberships(id,organization_id,user_id,role_id,status) values('${membership}','${organization}','${actor}','${role}','active'),(gen_random_uuid(),'${organization}','${member}','${role}','active');
      insert into public.organization_role_permissions values('${role}','members.read'),('${role}','members.update'),('${role}','members.revoke'),('${role}','roles.manage'),('${role}','modules.access');
      insert into public.shared_companies values('${organization}','company-a'),('${organization}','company-b');
      create function public.access_control_role_json(uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;
      create function public.organization_actor_has_permission(uuid,uuid,text) returns boolean language sql stable as $$
        select exists(select 1 from public.organization_memberships m join public.organization_role_permissions p on p.role_id=m.role_id where m.organization_id=$1 and m.user_id=$2 and m.status='active' and p.permission_code=$3)
      $$;
    `);
    await db.exec(await readFile(new URL("../../../../../supabase/migrations/291_user_security_access.sql", import.meta.url), "utf8"));
    const created = await db.query("select public.organization_user_security_create($1,$2,$3,$4,$5,$6::text[]) value", [organization, actor, member, "Miembro", 10, ["company-a"]]);
    assert.equal(created.rows[0].value.allowed_company_ids[0], "company-a");
    await assert.rejects(() => db.query("select public.organization_user_security_create($1,$2,$3,$4,$5,$6::text[])", [organization, actor, member, null, 0, []]));
    await assert.rejects(() => db.query("select public.assert_user_security_access($1,$2,$3,$4)", [member, organization, "company-b", "members.read"]), /ORGANIZATIONAL_USER_ACCESS_DENIED/);
    await assert.rejects(() => db.query("select public.organization_user_security_update($1,$2,$3,$4,$5::jsonb)", [organization, actor, member, 1, JSON.stringify({ displayName: 42 })]), /ORGANIZATIONAL_USER_DATA_INVALID/);
    await db.query("select public.organization_scoped_grant_grant($1,$2,$3,$4,$5,$6,$7)", [organization, actor, membership, "modules.access", "module", "payroll", null]);
    await assert.rejects(() => db.query("select public.organization_scoped_grant_grant($1,$2,$3,$4,$5,$6,$7)", [organization, actor, membership, "documents.void", "process", "void", null]), /ORGANIZATIONAL_USER_ACCESS_DENIED/);
    const allowed = await db.query("select public.organization_scoped_grant_has($1,$2,$3,$4,$5,$6) value", [actor, organization, null, "modules.access", "module", "payroll"]);
    assert.equal(allowed.rows[0].value, true);
    await db.query("insert into public.organization_roles values('00000000-0000-4000-8000-000000000007',$1,'temporary','Temporary','','custom','active',1,now())", [organization]);
    await db.query("update public.organization_memberships set role_id='00000000-0000-4000-8000-000000000007',status='suspended' where user_id=$1", [member]);
    await assert.rejects(db.query("select access_control_archive_role('00000000-0000-4000-8000-000000000007',1)"),/ROLE_IN_USE/);
    await db.query("update public.organization_memberships set role_id=$1,status='active' where user_id=$2",[role,member]);
    await db.query("select access_control_archive_role('00000000-0000-4000-8000-000000000007',1)");
    await assert.rejects(db.query("update public.organization_memberships set role_id='00000000-0000-4000-8000-000000000007' where user_id=$1",[member]),/ROLE_NOT_FOUND/);
    await db.query("insert into public.organization_roles values('00000000-0000-4000-8000-000000000006',$1,'owner','Owner','','system','active',1,now())", [organization]);
    await db.query("update public.organization_memberships set role_id='00000000-0000-4000-8000-000000000006' where organization_id=$1 and user_id=$2", [organization, member]);
    await assert.rejects(() => db.query("select public.organization_user_security_revoke($1,$2,$3,$4)", [organization, actor, member, 1]), /ORGANIZATIONAL_USER_ACCESS_DENIED/);
  } finally { await db.close(); }
});
