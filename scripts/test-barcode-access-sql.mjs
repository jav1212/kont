/**
 * Executes the real migrations against disposable embedded PostgreSQL fixtures.
 * Install @electric-sql/pglite@0.3.14 in a temporary prefix and set
 * PGLITE_MODULE_PATH to its dist/index.js; no connection to production is made.
 */
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : '@electric-sql/pglite');
const db = new PGlite();
const owner = '00000000-0000-4000-8000-000000000001';
const member = '00000000-0000-4000-8000-000000000002';
const outsider = '00000000-0000-4000-8000-000000000003';
const providerSession = '00000000-0000-4000-8000-000000000004';
const nextSession = '00000000-0000-4000-8000-000000000005';

try {
    await db.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE ROLE authenticator;
        CREATE SCHEMA auth; CREATE SCHEMA storage;
        CREATE TABLE auth.users (id uuid PRIMARY KEY);
        CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid);
        CREATE TABLE public.tenants (id uuid PRIMARY KEY, status text DEFAULT 'active');
        CREATE TABLE public.tenant_memberships (id uuid DEFAULT gen_random_uuid(), tenant_id uuid, member_id uuid, accepted_at timestamptz, revoked_at timestamptz);
        CREATE TABLE public.shared_authorization_permissions (code text PRIMARY KEY, resource text, action text, description text);
        CREATE TABLE public.shared_authorization_role_permissions (role text, permission_code text, PRIMARY KEY(role, permission_code));
        CREATE TABLE public.fixture_private_data (id integer PRIMARY KEY);
        INSERT INTO public.fixture_private_data VALUES (1);
        ALTER TABLE public.fixture_private_data ENABLE ROW LEVEL SECURITY;
        CREATE POLICY fixture_read ON public.fixture_private_data FOR SELECT TO authenticated USING (true);
        GRANT USAGE ON SCHEMA public, storage TO authenticated;
        GRANT SELECT ON public.fixture_private_data TO authenticated;
        CREATE TABLE storage.objects (id integer PRIMARY KEY);
        INSERT INTO storage.objects VALUES (1);
        ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
        CREATE POLICY fixture_read ON storage.objects FOR SELECT TO authenticated USING (true);
        GRANT SELECT ON storage.objects TO authenticated;
    `);
    for (const name of ['254_barcode_access_foundation.sql', '255_barcode_access_direct_data_guard.sql']) {
        await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }
    // Production readiness distinguishes provider tables: a permissive
    // provider policy requires a PUBLIC barcode guard. The repository's 255
    // fixture predates that refinement, so emulate the deployed contract.
    await db.exec(`
        DROP POLICY barcode_web_only ON storage.objects;
        CREATE POLICY barcode_web_only ON storage.objects AS RESTRICTIVE FOR ALL TO PUBLIC
            USING ((SELECT public.barcode_direct_data_allowed()))
            WITH CHECK ((SELECT public.barcode_direct_data_allowed()));
        CREATE OR REPLACE FUNCTION public.barcode_access_protection_ready()
        RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = pg_catalog, public
        AS $$
            SELECT EXISTS (
                SELECT 1 FROM pg_roles WHERE rolname = 'authenticator'
                  AND 'pgrst.db_pre_request=public.barcode_check_data_request' = ANY(COALESCE(rolconfig, ARRAY[]::text[]))
            ) AND NOT EXISTS (
                SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relkind IN ('r', 'p') AND c.relrowsecurity
                  AND (
                      n.nspname NOT IN ('storage', 'realtime')
                      OR EXISTS (
                          SELECT 1 FROM pg_policy existing_policy
                          WHERE existing_policy.polrelid = c.oid AND existing_policy.polpermissive
                      )
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
                        AND p.polname = 'barcode_web_only' AND NOT p.polpermissive
                        AND (
                            (n.nspname IN ('storage', 'realtime') AND p.polroles = ARRAY[0::oid])
                            OR (n.nspname NOT IN ('storage', 'realtime') AND p.polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')])
                        )
                  )
            );
        $$;
    `);
    assert.equal((await db.query('SELECT public.barcode_access_protection_ready() AS ready')).rows[0].ready, true);
    // Application tables and permissive provider tables need the guard. A
    // default-deny provider relation has no browser access to protect.
    await db.exec(`
        CREATE SCHEMA realtime;
        CREATE SCHEMA tenant_fixture;
        CREATE TABLE public.shared_inventory_product_components(id integer PRIMARY KEY);
        CREATE TABLE public.shared_inventory_sales_invoice_item_components(id integer PRIMARY KEY);
        CREATE TABLE storage.buckets_analytics(id integer PRIMARY KEY);
        CREATE TABLE realtime.messages(id integer PRIMARY KEY);
        CREATE TABLE tenant_fixture.orders(id integer PRIMARY KEY);
        ALTER TABLE public.shared_inventory_product_components ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.shared_inventory_sales_invoice_item_components ENABLE ROW LEVEL SECURITY;
        ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;
        ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
        ALTER TABLE tenant_fixture.orders ENABLE ROW LEVEL SECURITY;
        INSERT INTO storage.buckets_analytics VALUES (1);
        INSERT INTO realtime.messages VALUES (1);
        GRANT USAGE ON SCHEMA realtime, tenant_fixture TO authenticated;
        GRANT SELECT ON storage.buckets_analytics, realtime.messages TO authenticated;
    `);
    assert.equal((await db.query('SELECT public.barcode_access_protection_ready() AS ready')).rows[0].ready, false);
    await db.exec(await readFile(new URL('../supabase/migrations/269_restore_barcode_access_rls_guards.sql', import.meta.url), 'utf8'));
    assert.equal((await db.query('SELECT public.barcode_access_protection_ready() AS ready')).rows[0].ready, true);
    await db.exec('SET ROLE authenticated');
    assert.equal((await db.query('SELECT * FROM storage.buckets_analytics')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM realtime.messages')).rows.length, 0);
    await db.exec('RESET ROLE');
    assert.equal((await db.query("SELECT count(*)::int AS count FROM pg_policy WHERE polname='barcode_web_only' AND polrelid='storage.buckets_analytics'::regclass")).rows[0].count, 0);

    // Later application and permissive provider tables fail closed until the
    // idempotent repair is reapplied.
    await db.exec(`
        CREATE TABLE public.shared_fiscal_documents(id integer PRIMARY KEY);
        CREATE TABLE storage.vector_indexes(id integer PRIMARY KEY);
        CREATE TABLE realtime.presence(id integer PRIMARY KEY);
        CREATE TABLE tenant_fixture.later_orders(id integer PRIMARY KEY);
        ALTER TABLE public.shared_fiscal_documents ENABLE ROW LEVEL SECURITY;
        ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;
        ALTER TABLE realtime.presence ENABLE ROW LEVEL SECURITY;
        ALTER TABLE tenant_fixture.later_orders ENABLE ROW LEVEL SECURITY;
        CREATE POLICY provider_visible ON storage.vector_indexes FOR SELECT TO authenticated USING (true);
        CREATE POLICY provider_visible ON realtime.presence FOR SELECT TO authenticated USING (true);
    `);
    assert.equal((await db.query('SELECT public.barcode_access_protection_ready() AS ready')).rows[0].ready, false);
    const repair = await readFile(new URL('../supabase/migrations/269_restore_barcode_access_rls_guards.sql', import.meta.url), 'utf8');
    await db.exec(repair);
    assert.equal((await db.query('SELECT public.barcode_access_protection_ready() AS ready')).rows[0].ready, true);
    assert.equal((await db.query("SELECT polroles = ARRAY[0::oid] AS public_roles FROM pg_policy WHERE polrelid='storage.vector_indexes'::regclass AND polname='barcode_web_only'")).rows[0].public_roles, true);
    assert.equal((await db.query("SELECT polroles = ARRAY[0::oid] AS public_roles FROM pg_policy WHERE polrelid='realtime.presence'::regclass AND polname='barcode_web_only'")).rows[0].public_roles, true);
    await db.exec(repair);
    assert.equal((await db.query('SELECT public.barcode_access_protection_ready() AS ready')).rows[0].ready, true);
    await db.query('INSERT INTO auth.users VALUES ($1), ($2), ($3)', [owner, member, outsider]);
    await db.query('INSERT INTO public.tenants(id) VALUES ($1), ($2)', [owner, outsider]);
    await db.query('INSERT INTO public.tenant_memberships(tenant_id, member_id, accepted_at) VALUES ($1,$2,now())', [owner, member]);
    await db.query('INSERT INTO auth.sessions VALUES ($1,$2), ($3,$2)', [providerSession, member, nextSession]);
    const terminal = (await db.query(`INSERT INTO public.barcode_access_terminals(tenant_id,name,secret_hash,enrolled_by,protection_ready) VALUES($1,'Caja','test-secret',$1,true) RETURNING id`, [owner])).rows[0].id;
    const issue = async (userId, hash) => (await db.query('SELECT * FROM public.barcode_access_issue_badge($1,$2,$1,$3)', [owner, userId, hash])).rows[0];
    await assert.rejects(issue(outsider, 'outsider-hash'), /BARCODE_MEMBER_REQUIRED/);
    const firstBadge = await issue(member, 'first-hash');
    const badge = await issue(member, 'replacement-hash');
    assert.equal((await db.query('SELECT status FROM public.barcode_access_badges WHERE id=$1', [firstBadge.id])).rows[0].status, 'revoked');
    const register = async (sid, tid = owner, bid = badge.id) => (await db.query("SELECT * FROM public.barcode_access_register_session($1,$2,$3,$4,$5,now()+interval '8 hours')", [sid, member, tid, terminal, bid])).rows[0];
    await assert.rejects(register(providerSession, outsider), /BARCODE_TERMINAL_UNAVAILABLE/);
    await assert.rejects(register(providerSession, owner, firstBadge.id), /BARCODE_BADGE_UNAVAILABLE/);
    await assert.rejects(register('00000000-0000-4000-8000-000000000099'), /BARCODE_PROVIDER_SESSION_UNAVAILABLE/);
    await register(providerSession);
    await register(nextSession);
    assert.equal((await db.query('SELECT status FROM public.barcode_access_sessions WHERE supabase_session_id=$1', [providerSession])).rows[0].status, 'locked');
    assert.equal((await db.query("SELECT count(*)::int AS count FROM public.barcode_access_sessions WHERE terminal_id=$1 AND status='active'", [terminal])).rows[0].count, 1);

    // Both current and revoked JWTs are denied direct data access; regular
    // provider sessions retain their existing permissive RLS behavior.
    for (const sid of [providerSession, nextSession]) {
        await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ session_id: sid, sub: member, role: 'authenticated' })]);
        await db.exec('SET ROLE authenticated');
        assert.equal((await db.query('SELECT * FROM public.fixture_private_data')).rows.length, 0);
        assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length, 0);
        await assert.rejects(db.query('SELECT public.barcode_check_data_request()'), /terminal Web autorizada/);
        await db.exec('RESET ROLE');
    }
    await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ session_id: outsider, sub: member, role: 'authenticated' })]);
    await db.exec('SET ROLE authenticated');
    assert.equal((await db.query('SELECT * FROM public.fixture_private_data')).rows.length, 1);
    assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length, 1);
    await db.query('SELECT public.barcode_check_data_request()');
    await db.exec('RESET ROLE');
    await db.exec(`SELECT set_config('request.jwt.claims','{}',false)`);
    await db.query('DELETE FROM auth.sessions WHERE id=$1', [nextSession]);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM public.barcode_access_sessions WHERE supabase_session_id=$1', [nextSession])).rows[0].count, 1);
    await db.query('DELETE FROM public.tenants WHERE id=$1', [owner]);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM public.barcode_access_sessions WHERE tenant_id=$1', [owner])).rows[0].count, 2);

    await db.exec('CREATE TABLE public.new_unprotected_table(id integer); ALTER TABLE public.new_unprotected_table ENABLE ROW LEVEL SECURITY');
    assert.equal((await db.query('SELECT public.barcode_access_protection_ready() AS ready')).rows[0].ready, false);
    console.log('PASS: real migrations, recovered post-guard RLS readiness, badge replacement, tenant isolation, provider binding, terminal session replacement, direct RPC/RLS/Storage denial, normal-session compatibility, revocation tombstones, and readiness fail-closed.');
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await db.close();
}
