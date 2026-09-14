/**
 * Checks encrypted badge issuance against disposable embedded PostgreSQL fixtures.
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
        GRANT USAGE ON SCHEMA public, storage TO anon, authenticated;
        GRANT SELECT ON public.fixture_private_data TO authenticated;
        CREATE TABLE storage.objects (id integer PRIMARY KEY);
        INSERT INTO storage.objects VALUES (1);
        ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
        CREATE POLICY fixture_read ON storage.objects FOR SELECT USING (true);
        GRANT SELECT ON storage.objects TO anon, authenticated;
        CREATE TABLE storage.default_deny (id integer PRIMARY KEY);
        INSERT INTO storage.default_deny VALUES (1);
        ALTER TABLE storage.default_deny ENABLE ROW LEVEL SECURITY;
        GRANT SELECT ON storage.default_deny TO anon, authenticated;
    `);
    for (const name of ['254_barcode_access_foundation.sql', '255_barcode_access_direct_data_guard.sql', '262_barcode_badge_reprinting.sql']) {
        await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }
    await db.query('INSERT INTO auth.users VALUES ($1), ($2)', [owner, member]);
    await db.query('INSERT INTO public.tenants(id) VALUES ($1)', [owner]);
    await db.query('INSERT INTO public.tenant_memberships(tenant_id,member_id,accepted_at) VALUES ($1,$2,now())', [owner, member]);

    const legacy = (await db.query('SELECT * FROM public.barcode_access_issue_badge($1,$2,$1,$3)', [owner, member, 'legacy-hash'])).rows[0];
    assert.equal(legacy.code_ciphertext, null);
    const encrypted = (await db.query('SELECT * FROM public.barcode_access_issue_badge($1,$2,$1,$3,$4)', [owner, member, 'new-hash', 'v1.fixture.ciphertext'])).rows[0];
    assert.equal(encrypted.code_ciphertext, 'v1.fixture.ciphertext');
    assert.equal(encrypted.status, 'active');
    assert.equal((await db.query('SELECT status FROM public.barcode_access_badges WHERE id=$1', [legacy.id])).rows[0].status, 'revoked');
    await assert.rejects(db.query('SELECT * FROM public.barcode_access_issue_badge($1,$2,$1,$3,$4)', [owner, member, 'broken-hash', null]), /BARCODE_CIPHERTEXT_REQUIRED/);
    assert.equal((await db.query('SELECT id FROM public.barcode_access_badges WHERE status=$1', ['active'])).rows[0].id, encrypted.id);
    assert.equal((await db.query('SELECT public.barcode_access_protection_ready() AS ready')).rows[0].ready, true);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query('SELECT code_ciphertext FROM public.barcode_access_badges'), /permission denied/);
    await assert.rejects(db.query('SELECT * FROM public.barcode_access_issue_badge($1,$2,$1,$3,$4)', [owner, member, 'forbidden-hash', 'ciphertext']), /permission denied/);
    await db.exec('RESET ROLE');
    await db.exec('SET ROLE service_role');
    const serviceIssued = (await db.query('SELECT * FROM public.barcode_access_issue_badge($1,$2,$1,$3,$4)', [owner, member, 'service-hash', 'v1.service.ciphertext'])).rows[0];
    assert.equal(serviceIssued.code_ciphertext, 'v1.service.ciphertext');
    await db.exec('RESET ROLE');
    await db.query('INSERT INTO public.barcode_access_audit(tenant_id,user_id,event) VALUES ($1,$2,$3),($1,$2,$4)', [owner, member, 'badge_reprinted', 'badges_exported']);
    console.log('PASS: old RPC compatibility, atomic encrypted replacement, invalid ciphertext rollback, direct role denial, service-role issuance, audit events, and unchanged barcode protection readiness.');
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await db.close();
}
