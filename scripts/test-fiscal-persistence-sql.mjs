/**
 * Exercises the fiscal persistence migration against a disposable embedded
 * PostgreSQL database. Set PGLITE_MODULE_PATH when PGlite is installed outside
 * this repository; this script never connects to Supabase.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : '@electric-sql/pglite');
const db = new PGlite();

const tenantA = '00000000-0000-4000-8000-000000000001';
const tenantB = '00000000-0000-4000-8000-000000000002';
const organizationA = '00000000-0000-4000-8000-000000000011';
const organizationB = '00000000-0000-4000-8000-000000000012';
const actorA = '00000000-0000-4000-8000-000000000021';
const actorB = '00000000-0000-4000-8000-000000000022';
const actorOutside = '00000000-0000-4000-8000-000000000023';
const company = 'J-12345678-9';
const occurredAt = '2026-09-27T12:00:00.000Z';

/** @param {string} id @returns {object} A valid draft snapshot. */
function draftSnapshot(id) {
    return { id, companyId: company, direction: 'issued', status: 'draft', currency: 'VES' };
}

/** @param {string} id @returns {object} A valid issued snapshot. */
function issuedSnapshot(id) {
    return {
        ...draftSnapshot(id),
        status: 'issued',
        number: '00000001',
        issuedAt: occurredAt,
        issueDate: '2026-09-27',
        issuanceEvidence: { provider: 'fixture-provider', reference: 'fixture-reference' },
    };
}

/**
 * Executes a scoped draft persistence RPC as the service role.
 * @param {string} documentId Stable fiscal document identifier.
 * @param {string} sourceId Stable source identifier.
 * @param {string} idempotencyKey Stable command key.
 * @returns {Promise<object>} RPC result.
 */
async function persist(documentId, sourceId, idempotencyKey) {
    const result = await db.query(
        `SELECT public.shared_fiscal_document_persist_draft(
            $1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10
        ) AS result`,
        [tenantA, organizationA, company, 'legacy_sales_invoice', sourceId, documentId,
            JSON.stringify(draftSnapshot(documentId)), idempotencyKey, actorA, occurredAt],
    );
    return result.rows[0].result;
}

try {
    await db.exec(`
        CREATE ROLE anon;
        CREATE ROLE authenticated;
        CREATE ROLE service_role BYPASSRLS;
        CREATE SCHEMA auth;
        CREATE TABLE auth.users (id uuid PRIMARY KEY);
        CREATE TABLE public.tenants (id uuid PRIMARY KEY);
        CREATE TABLE public.organizations (id uuid PRIMARY KEY);
        CREATE TABLE public.shared_companies (
            tenant_id uuid NOT NULL,
            id text NOT NULL,
            organization_id uuid NOT NULL,
            PRIMARY KEY (tenant_id, id)
        );
        CREATE TABLE public.shared_inventory_sales_invoices (
            tenant_id uuid NOT NULL, id text NOT NULL, company_id text NOT NULL,
            status text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (tenant_id, id)
        );
        CREATE TABLE public.organization_memberships (
            organization_id uuid NOT NULL,
            user_id uuid NOT NULL,
            status text NOT NULL
        );
        CREATE TABLE public.organization_delegations (
            id uuid PRIMARY KEY,
            client_organization_id uuid NOT NULL,
            status text NOT NULL,
            valid_from timestamptz NOT NULL,
            valid_until timestamptz
        );
        CREATE TABLE public.organization_delegation_member_assignments (
            delegation_id uuid NOT NULL,
            user_id uuid NOT NULL,
            status text NOT NULL
        );
        CREATE TABLE public.organization_delegation_scopes (
            delegation_id uuid NOT NULL,
            scope text NOT NULL
        );
        CREATE SEQUENCE public.fixture_uuid_sequence;
        CREATE FUNCTION public.gen_random_uuid() RETURNS uuid
        LANGUAGE sql VOLATILE AS $$
            SELECT ('00000000-0000-4000-9000-' || lpad(nextval('public.fixture_uuid_sequence')::text, 12, '0'))::uuid
        $$;
        GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/268_fiscal_documents.sql', import.meta.url), 'utf8'));
    await db.exec(`
        INSERT INTO public.tenants(id) VALUES ('${tenantA}'), ('${tenantB}');
        INSERT INTO public.organizations(id) VALUES ('${organizationA}'), ('${organizationB}');
        INSERT INTO auth.users(id) VALUES ('${actorA}'), ('${actorB}'), ('${actorOutside}');
        INSERT INTO public.shared_companies(tenant_id,id,organization_id) VALUES
            ('${tenantA}','${company}','${organizationA}'), ('${tenantB}','${company}','${organizationB}');
        INSERT INTO public.shared_inventory_sales_invoices(tenant_id,id,company_id,status,updated_at) VALUES
            ('${tenantA}','sales-1','${company}','confirmada','${occurredAt}'),
            ('${tenantA}','sales-2','${company}','confirmada','${occurredAt}'),
            ('${tenantA}','sales-3','${company}','confirmada','${occurredAt}');
        INSERT INTO public.organization_memberships(organization_id,user_id,status) VALUES
            ('${organizationA}','${actorA}','active'), ('${organizationB}','${actorB}','active');
        INSERT INTO public.organization_delegations(id,client_organization_id,status,valid_from) VALUES
            ('00000000-0000-4000-8000-000000000031','${organizationA}','active',now()-interval '1 day');
        INSERT INTO public.organization_delegation_member_assignments(delegation_id,user_id,status) VALUES
            ('00000000-0000-4000-8000-000000000031','${actorB}','active');
        INSERT INTO public.organization_delegation_scopes(delegation_id,scope) VALUES
            ('00000000-0000-4000-8000-000000000031','sales');
    `);

    await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query('SELECT * FROM public.shared_fiscal_documents'), /permission denied/i);
    await assert.rejects(
        db.query('SELECT public.shared_fiscal_document_find($1,$2,$3,$4)', [tenantA, organizationA, company, 'document-1']),
        /permission denied/i,
    );
    await db.exec('RESET ROLE; SET ROLE service_role');
    await assert.rejects(db.query('SELECT * FROM public.shared_fiscal_documents'), /permission denied/i);
    const grants = (await db.query(`
        SELECT
            has_table_privilege('service_role', 'public.shared_fiscal_documents', 'select') AS direct_table_read,
            has_function_privilege('service_role', 'public.shared_fiscal_document_persist_draft(uuid,uuid,text,text,text,text,jsonb,text,uuid,timestamptz)', 'execute') AS persist_rpc
    `)).rows[0];
    assert.equal(grants.direct_table_read, false);
    assert.equal(grants.persist_rpc, true);
    // PGlite currently executes SECURITY DEFINER routines with the invoking
    // role's table ACLs. The grant assertions above cover the service contract;
    // reset to the migration owner to exercise the real SQL body.
    await db.exec('RESET ROLE');

    const first = await persist('document-1', 'sales-1', 'prepare-1');
    assert.equal(first.replayed, false);
    assert.equal(first.document.document_status, 'draft');
    assert.equal(first.event.event_type, 'fiscal_document.prepared');

    const [retryA, retryB] = await Promise.all([
        persist('document-2', 'sales-2', 'prepare-2'),
        persist('document-2', 'sales-2', 'prepare-2'),
    ]);
    assert.deepEqual([retryA.replayed, retryB.replayed].sort(), [false, true]);
    assert.equal((await db.query(
        `SELECT count(*)::int AS count FROM public.shared_fiscal_documents WHERE tenant_id=$1 AND id='document-2'`, [tenantA],
    )).rows[0].count, 1);
    assert.equal((await db.query(
        `SELECT count(*)::int AS count FROM public.shared_fiscal_document_events WHERE tenant_id=$1 AND document_id='document-2'`, [tenantA],
    )).rows[0].count, 1);

    const found = (await db.query(
        'SELECT public.shared_fiscal_document_find($1,$2,$3,$4) AS result', [tenantA, organizationA, company, 'document-1'],
    )).rows[0].result;
    assert.equal(found.id, 'document-1');
    const listed = (await db.query(
        'SELECT public.shared_fiscal_document_list($1,$2,$3,100,NULL,NULL) AS result', [tenantA, organizationA, company],
    )).rows[0].result;
    assert.equal(listed.items.length, 2);
    const events = (await db.query(
        'SELECT public.shared_fiscal_document_event_list($1,$2,$3,$4,100,NULL,NULL) AS result', [tenantA, organizationA, company, 'document-1'],
    )).rows[0].result;
    assert.equal(events.items.length, 1);

    assert.equal((await db.query(
        'SELECT public.shared_fiscal_document_find($1,$2,$3,$4) AS result', [tenantB, organizationB, company, 'document-1'],
    )).rows[0].result, null);
    assert.equal((await db.query(
        'SELECT public.shared_fiscal_document_list($1,$2,$3,100,NULL,NULL) AS result', [tenantB, organizationB, company],
    )).rows[0].result.items.length, 0);
    await assert.rejects(
        db.query('SELECT public.shared_fiscal_document_persist_draft($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)', [
            tenantA, organizationA, company, 'legacy_sales_invoice', 'sales-actor', 'document-actor',
            JSON.stringify(draftSnapshot('document-actor')), 'prepare-actor', actorOutside, occurredAt,
        ]),
        /FISCAL_DOCUMENT_ACTOR_OUTSIDE_ORGANIZATION/,
    );
    const delegated = (await db.query(
        'SELECT public.shared_fiscal_document_persist_draft($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) AS result', [
            tenantA, organizationA, company, 'legacy_sales_invoice', 'sales-delegated', 'document-delegated',
            JSON.stringify(draftSnapshot('document-delegated')), 'prepare-delegated', actorB, occurredAt,
        ],
    )).rows[0].result;
    assert.equal(delegated.document.created_by, actorB);

    const accepted = await db.query(
        `SELECT public.shared_fiscal_document_record_issuance_attempt(
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13
        ) AS result`,
        [tenantA, organizationA, company, 'attempt-1', 'document-1', 'fixture-provider', 'command-1',
            'accepted', 'fingerprint-1', 'fixture-reference', null, JSON.stringify(issuedSnapshot('document-1')), occurredAt],
    );
    assert.equal(accepted.rows[0].result.document.document_status, 'issued');
    const replayedAttempt = (await db.query(
        `SELECT public.shared_fiscal_document_record_issuance_attempt(
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13
        ) AS result`,
        [tenantA, organizationA, company, 'attempt-1', 'document-1', 'fixture-provider', 'command-1',
            'accepted', 'fingerprint-1', 'fixture-reference', null, JSON.stringify(issuedSnapshot('document-1')), occurredAt],
    )).rows[0].result;
    assert.equal(replayedAttempt.replayed, true);

    await db.exec('RESET ROLE');
    await assert.rejects(
        db.query(`UPDATE public.shared_fiscal_documents SET document_status='draft' WHERE tenant_id=$1 AND id='document-1'`, [tenantA]),
        /FISCAL_DOCUMENT_IMMUTABLE/,
    );
    await assert.rejects(
        db.query(`DELETE FROM public.shared_fiscal_document_events WHERE tenant_id=$1 AND document_id='document-1'`, [tenantA]),
        /FISCAL_AUDIT_APPEND_ONLY/,
    );
    // Apply the real service-tax wrapper chain over a faithful legacy writer.
    // A caller without a line ID must still persist its service classification.
    await db.exec(`
        CREATE TABLE public.tenant_memberships (
            tenant_id uuid NOT NULL, member_id uuid NOT NULL, accepted_at timestamptz, revoked_at timestamptz
        );
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
        CREATE TABLE public.shared_inventory_sales_invoice_items (
            tenant_id uuid NOT NULL, id text NOT NULL, invoice_id text NOT NULL, product_id text,
            PRIMARY KEY (tenant_id, id)
        );
        CREATE OR REPLACE FUNCTION public.shared_inventory_sales_invoice_save(
            p_tenant_id uuid, p_invoice jsonb, p_items jsonb DEFAULT '[]'::jsonb
        ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
        declare v_item jsonb;
        begin
            delete from public.shared_inventory_sales_invoice_items
             where tenant_id = p_tenant_id and invoice_id = p_invoice->>'id';
            for v_item in select value from jsonb_array_elements(p_items) loop
                insert into public.shared_inventory_sales_invoice_items(tenant_id,id,invoice_id,product_id)
                values (p_tenant_id, v_item->>'id', p_invoice->>'id', nullif(v_item->>'producto_id',''));
            end loop;
            return jsonb_build_object('id', p_invoice->>'id');
        end;
        $$;
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/281_service_tax_classifications.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/282_service_tax_classification_stable_line_ids.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/283_fiscal_draft_revisions.sql', import.meta.url), 'utf8'));

    const revisedSnapshot = { ...draftSnapshot('document-2'), marker: 'revised' };
    const revised = (await db.query(
        `SELECT public.shared_fiscal_document_revise_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) AS result`,
        [tenantA, organizationA, company, 'document-2', 1, 'Service update.', 'revise-1', actorA, occurredAt, JSON.stringify(revisedSnapshot), occurredAt],
    )).rows[0].result;
    assert.equal(revised.revision, 2);
    assert.equal(revised.document.document_snapshot.marker, 'revised');
    const replayedRevision = (await db.query(
        `SELECT public.shared_fiscal_document_revise_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) AS result`,
        [tenantA, organizationA, company, 'document-2', 1, 'Service update.', 'revise-1', actorA, occurredAt, JSON.stringify(revisedSnapshot), occurredAt],
    )).rows[0].result;
    assert.equal(replayedRevision.replayed, true);
    assert.equal(replayedRevision.revision, 2);
    assert.equal(replayedRevision.document.document_snapshot.marker, 'revised');
    const revisionEvent = (await db.query(
        `SELECT payload FROM public.shared_fiscal_document_events WHERE tenant_id=$1 AND document_id='document-2' AND event_type='fiscal_document.revised'`, [tenantA],
    )).rows[0];
    assert.equal(revisionEvent.payload.fromRevision, 1);
    assert.equal(revisionEvent.payload.toRevision, 2);
    assert.equal(revisionEvent.payload.previousSnapshot.id, 'document-2');
    assert.equal(revisionEvent.payload.replacementSnapshot.marker, 'revised');
    await assert.rejects(db.query(
        `SELECT public.shared_fiscal_document_revise_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
        [tenantA, organizationA, company, 'document-2', 1, 'Another update.', 'revise-2', actorA, occurredAt, JSON.stringify(revisedSnapshot), occurredAt],
    ), /FISCAL_DOCUMENT_REVISION_CONFLICT/);
    await assert.rejects(db.query(
        `SELECT public.shared_fiscal_document_revise_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
        [tenantA, organizationA, company, 'document-1', 1, 'Issued documents cannot be revised.', 'revise-issued', actorA, occurredAt, JSON.stringify(draftSnapshot('document-1')), occurredAt],
    ), /FISCAL_DOCUMENT_TRANSITION_INVALID/);
    await persist('document-3', 'sales-3', 'prepare-3');
    await db.query(`UPDATE public.shared_inventory_sales_invoices SET updated_at='2026-09-28T00:00:00.000Z' WHERE tenant_id=$1 AND id='sales-3'`, [tenantA]);
    await assert.rejects(db.query(
        `SELECT public.shared_fiscal_document_revise_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
        [tenantA, organizationA, company, 'document-3', 1, 'Source changed.', 'revise-source', actorA, occurredAt, JSON.stringify(draftSnapshot('document-3')), occurredAt],
    ), /FISCAL_DOCUMENT_SOURCE_CONFLICT/);
    await db.query(
        `INSERT INTO public.shared_service_tax_profiles(
            tenant_id,id,company_id,service_code,fiscal_unit_code,jurisdiction
        ) VALUES ($1,'service-profile-1',$2,'SERVICIO-IVA','UND','VE')`,
        [tenantA, company],
    );
    await db.query(
        `SELECT public.shared_inventory_sales_invoice_save($1,$2::jsonb,$3::jsonb)`,
        [tenantA, JSON.stringify({ id: 'invoice-service-1', empresa_id: company }),
            JSON.stringify([{ producto_id: null, service_tax_code: 'SERVICIO-IVA' }])],
    );
    const savedLine = (await db.query(
        `SELECT id, service_tax_code FROM public.shared_inventory_sales_invoice_items
         WHERE tenant_id=$1 AND invoice_id='invoice-service-1'`,
        [tenantA],
    )).rows[0];
    assert.ok(savedLine.id);
    assert.equal(savedLine.service_tax_code, 'SERVICIO-IVA');
    await assert.rejects(
        db.query(
            `SELECT public.shared_inventory_sales_invoice_save($1,$2::jsonb,$3::jsonb)`,
            [tenantA, JSON.stringify({ id: 'invoice-product-1', empresa_id: company }),
                JSON.stringify([{ id: 'line-product-1', producto_id: 'product-1', service_tax_code: 'SERVICIO-IVA' }])],
        ),
        /TAXATION_PROFILE_INVALID/,
    );
    console.log('PASS: fiscal migration installs, scopes service-only RPCs, persists atomically, replays concurrent retries, isolates tenant/company data, validates actors, lists evidence, records issuance, enforces immutable audit evidence, and preserves classified service lines without caller-provided IDs.');
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await db.close();
}
