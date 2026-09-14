/**
 * Executes the production role migrations against a disposable PGlite database.
 * Set PGLITE_MODULE_PATH when PGlite is installed outside this repository.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const db = new PGlite();
const organizationA = "00000000-0000-4000-8000-000000000001";
const organizationB = "00000000-0000-4000-8000-000000000002";

/**
 * Finds one seeded role for an organization and role code.
 * @param organizationId - Organization containing the provisioned role.
 * @param code - Stable system role code to retrieve.
 * @returns The role identifier and optimistic-concurrency version.
 */
async function seededRole(organizationId, code) {
  const result = await db.query("SELECT id,version FROM public.organization_roles WHERE organization_id=$1 AND code=$2", [organizationId, code]);
  assert.equal(result.rows.length, 1, `${code} must be provisioned once`);
  return result.rows[0];
}

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE TABLE public.organizations (id uuid PRIMARY KEY, status text NOT NULL DEFAULT 'active');
    CREATE TABLE public.organization_memberships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
      user_id uuid NOT NULL, role text NOT NULL DEFAULT 'owner', role_id uuid, authorization_version integer NOT NULL DEFAULT 1,
      status text NOT NULL DEFAULT 'active', updated_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO public.organizations(id) VALUES ('${organizationA}'), ('${organizationB}');
  `);
  for (const migration of ["201_organization_access_control_foundation.sql", "218_native_role_management.sql", "261_organization_system_role_permission_overrides.sql"]) {
    try {
      await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
    } catch (error) {
      throw new Error(`${migration}: ${error.message}`);
    }
  }

  for (const organizationId of [organizationA, organizationB]) {
    const roles = await db.query("SELECT code,kind FROM public.organization_roles WHERE organization_id=$1 ORDER BY code", [organizationId]);
    assert.deepEqual(roles.rows, [
      { code: "accountant", kind: "system" }, { code: "admin", kind: "system" }, { code: "cashier", kind: "system" },
      { code: "owner", kind: "system" }, { code: "seller", kind: "system" },
    ]);
  }

  const admin = await seededRole(organizationA, "admin");
  const owner = await seededRole(organizationA, "owner");
  const template = (await db.query("SELECT id,version FROM public.organization_roles WHERE organization_id IS NULL AND code='admin'" )).rows[0];
  const cashierB = await seededRole(organizationB, "cashier");
  await db.query("INSERT INTO public.organization_memberships(organization_id,user_id,role,role_id) VALUES($1,'00000000-0000-4000-8000-000000000021','admin',$2)", [organizationA, admin.id]);
  const before = (await db.query("SELECT role.version,membership.authorization_version FROM public.organization_roles role JOIN public.organization_memberships membership ON membership.role_id=role.id WHERE role.id=$1", [admin.id])).rows[0];

  const updated = (await db.query("SELECT public.access_control_update_role($1,$2,NULL,NULL,$3,false,false,true) AS role", [admin.id, before.version, ["reports.read"]])).rows[0].role;
  assert.deepEqual(updated.organization_role_permissions, [{ permission_code: "reports.read" }]);
  const afterUpdate = (await db.query("SELECT role.version,membership.authorization_version FROM public.organization_roles role JOIN public.organization_memberships membership ON membership.role_id=role.id WHERE role.id=$1", [admin.id])).rows[0];
  assert.ok(afterUpdate.version > before.version);
  assert.ok(afterUpdate.authorization_version > before.authorization_version);
  assert.deepEqual((await db.query("SELECT permission_code FROM public.organization_role_permissions WHERE role_id=$1", [cashierB.id])).rows.sort((left, right) => left.permission_code.localeCompare(right.permission_code)), [
    { permission_code: "companies.read" }, { permission_code: "inventory.read" }, { permission_code: "sales.confirm" }, { permission_code: "sales.create" }, { permission_code: "sales.read" },
  ]);

  await db.query("SELECT public.access_control_replace_role_permissions($1,$2)", [admin.id, ["sales.read"]]);
  assert.deepEqual((await db.query("SELECT permission_code FROM public.organization_role_permissions WHERE role_id=$1", [admin.id])).rows, [{ permission_code: "sales.read" }]);
  const afterLegacyReplacement = (await db.query("SELECT authorization_version FROM public.organization_memberships WHERE role_id=$1", [admin.id])).rows[0];
  assert.ok(afterLegacyReplacement.authorization_version > afterUpdate.authorization_version);

  const current = await seededRole(organizationA, "admin");
  await assert.rejects(db.query("SELECT public.access_control_update_role($1,$2,NULL,NULL,$3,false,false,true)", [admin.id, current.version, ["unknown.permission"]]), /ROLE_INVALID/);
  assert.deepEqual((await db.query("SELECT permission_code FROM public.organization_role_permissions WHERE role_id=$1", [admin.id])).rows, [{ permission_code: "sales.read" }]);
  await assert.rejects(db.query("SELECT public.access_control_update_role($1,$2,NULL,NULL,$3,false,false,true)", [owner.id, owner.version, ["reports.read"]]), /ROLE_NOT_FOUND/);
  await assert.rejects(db.query("SELECT public.access_control_update_role($1,$2,'Otro nombre',NULL,NULL,true,false,false)", [admin.id, current.version]), /SYSTEM_ROLE_IMMUTABLE/);
  await assert.rejects(db.query("SELECT public.access_control_update_role($1,$2,NULL,NULL,$3,false,false,true)", [template.id, template.version, ["reports.read"]]), /ROLE_NOT_FOUND/);
  await assert.rejects(db.query("DELETE FROM public.organization_roles WHERE id=$1", [admin.id]), /System roles cannot be deleted or archived/);
  await assert.rejects(db.query("SELECT public.access_control_update_role($1,$2,NULL,NULL,$3,false,false,true)", [admin.id, before.version, ["reports.read"]]), /ROLE_VERSION_CONFLICT/);
  await assert.rejects(db.query("SELECT public.access_control_update_role($1,NULL,NULL,NULL,$2,false,false,true)", [admin.id, ["reports.read"]]), /ROLE_INVALID/);
  assert.equal((await db.query("SELECT has_function_privilege('anon','public.access_control_update_role(uuid,integer,text,text,text[],boolean,boolean,boolean)','EXECUTE') AS allowed")).rows[0].allowed, false);
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','public.access_control_replace_role_permissions(uuid,text[])','EXECUTE') AS allowed")).rows[0].allowed, false);
  console.log("PASS: real provisioning defaults, system permission overrides, owner/template and archive protection, legacy RPC, tenant isolation, concurrency, authorization invalidation, rollback, and RPC privileges.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
