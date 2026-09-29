import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PGLITE_MODULE_PATH;

test(
  "account-security migration enforces CAS and durable evidence",
  { skip: !modulePath },
  async () => {
    const { PGlite } = await import(pathToFileURL(modulePath!).href);
    const db = new PGlite();
    const organizationId = "00000000-0000-4000-8000-000000000011";
    const userId = "00000000-0000-4000-8000-000000000021";
    try {
      await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, encrypted_password text, created_at timestamptz not null, updated_at timestamptz);
      create table public.organizations(id uuid primary key, legacy_tenant_id uuid, status text not null);
      create table profiles(id uuid primary key,name text);
      create table access_control_permissions(code text primary key,resource text,action text,description text);
      create table organization_roles(id uuid primary key,organization_id uuid,code text,name text,description text,kind text,status text,version integer default 1,updated_at timestamptz default now());
      create table organization_role_permissions(role_id uuid,permission_code text,primary key(role_id,permission_code));
      create table public.organization_memberships(id uuid primary key default gen_random_uuid(),organization_id uuid, user_id uuid,role_id uuid,role text,status text not null,version integer default 1,authorization_version integer default 1,updated_at timestamptz default now(),unique(organization_id,user_id));
      create table shared_companies(tenant_id uuid,id text,organization_id uuid,name text,primary key(tenant_id,id));
      create function public.access_control_role_json(uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;
      create function public.organization_actor_has_permission(o uuid,u uuid,p text) returns boolean language sql as $$ select exists(select 1 from organization_memberships m join organization_role_permissions r on r.role_id=m.role_id where m.organization_id=o and m.user_id=u and m.status='active' and r.permission_code=p) $$;
      insert into auth.users values('${userId}', 'ada@example.test', 'initial-hash', now(), now());
      insert into public.organizations values('${organizationId}', '${organizationId}', 'active');
      insert into organization_roles(id,organization_id,code,status) values('${organizationId}','${organizationId}','admin','active');
      insert into organization_role_permissions values('${organizationId}','roles.manage'),('${organizationId}','members.update');
      insert into public.organization_memberships(organization_id,user_id,role_id,status) values('${organizationId}', '${userId}','${organizationId}', 'active');
    `);
      await db.exec(
        await readFile(
          new URL(
            "../../../../../supabase/migrations/291_user_security_access.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await db.exec(
        await readFile(
          new URL(
            "../../../../../supabase/migrations/293_account_security_policies.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const policy = await db.query(
        "select public.account_security_get_policy($1) as value",
        [organizationId],
      );
      assert.equal(policy.rows[0].value.version, 1);
      const state = await db.query(
        "select public.account_security_read_state($1,$2) as value",
        [organizationId, userId],
      );
      const value = state.rows[0].value;
      const committed = await db.query(
        "select public.account_security_compare_and_swap($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as value",
        [
          organizationId,
          userId,
          value.version,
          value.policy_version,
          value.password_changed_at,
          value.last_authenticated_at,
          [],
          null,
          new Date().toISOString(),
          "invalid_credentials",
        ],
      );
      assert.equal(committed.rows[0].value, true);
      const stale = await db.query(
        "select public.account_security_compare_and_swap($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as value",
        [
          organizationId,
          userId,
          value.version,
          value.policy_version,
          value.password_changed_at,
          value.last_authenticated_at,
          [],
          null,
          new Date().toISOString(),
          "invalid_credentials",
        ],
      );
      assert.equal(stale.rows[0].value, false);
      const current = await db.query(
        "select public.account_security_read_state($1,$2) as value",
        [organizationId, userId],
      );
      const currentValue = current.rows[0].value;
      await db.query(
        "select public.account_security_update_policy($1,$2,$3,$4,$5,$6,$7,$8) as value",
        [
          organizationId,
          currentValue.policy_version,
          userId,
          null,
          null,
          5,
          15,
          15,
        ],
      );
      const policyStale = await db.query(
        "select public.account_security_compare_and_swap($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as value",
        [
          organizationId,
          userId,
          currentValue.version,
          currentValue.policy_version,
          currentValue.password_changed_at,
          currentValue.last_authenticated_at,
          [],
          null,
          new Date().toISOString(),
          "invalid_credentials",
        ],
      );
      assert.equal(policyStale.rows[0].value, false);
      const evidence = await db.query(
        "select outcome from public.account_security_attempts",
      );
      assert.deepEqual(evidence.rows, [{ outcome: "invalid_credentials" }]);
      // Recovery retains the actual password age while clearing inactivity.
      await db.query(
        "update account_security_states set last_authenticated_at='2000-01-01',locked_until=now()+interval '1 hour'",
      );
      const recovered = await db.query(
        "select account_security_unlock($1,$2,$1) value",
        [userId, organizationId],
      );
      assert.equal(recovered.rows[0].value.locked_until, null);
      assert.equal(
        recovered.rows[0].value.password_changed_at,
        value.password_changed_at,
      );
      assert.ok(
        Date.parse(recovered.rows[0].value.last_authenticated_at) >
          Date.parse("2000-01-01"),
      );
      // Ordinary profile updates must never reset credential age.
      await db.query(
        "update auth.users set updated_at=now()+interval '1 day' where id=$1",
        [userId],
      );
      const unchanged = await db.query(
        "select password_changed_at from account_security_states",
      );
      assert.equal(
        new Date(unchanged.rows[0].password_changed_at).toISOString(),
        new Date(value.password_changed_at).toISOString(),
      );
      await db.query(
        "update auth.users set encrypted_password='changed-hash' where id=$1",
        [userId],
      );
      const changed = await db.query(
        "select version from account_security_states",
      );
      assert.equal(
        changed.rows[0].version,
        recovered.rows[0].value.version + 1,
      );
      await db.exec("set role service_role");
      await assert.rejects(
        db.query("select account_security_authorize_invitation($1,$2)", [
          userId,
          organizationId,
        ]),
        /ACCESS_DENIED/,
      );
      await db.exec(
        "reset role; update organization_memberships set status='suspended'; set role service_role",
      );
      await assert.rejects(
        db.query(
          "select account_security_compare_and_swap($1,$2,1,1,now(),now(),'{}',null,null,null)",
          [organizationId, userId],
        ),
        /MEMBER_REQUIRED/,
      );
      await db.exec("set role authenticated");
      await assert.rejects(
        db.query("select account_security_get_policy($1)", [organizationId]),
        /permission denied/,
      );
    } finally {
      await db.close();
    }
  },
);
