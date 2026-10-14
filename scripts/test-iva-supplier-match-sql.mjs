/**
 * Exercises supplier invoice-match migration 336 against disposable embedded PostgreSQL.
 * Set PGLITE_MODULE_PATH when PGlite is installed outside the repository.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const database = new PGlite();
const tenantId = "00000000-0000-4000-8000-000000000001";
const organizationId = "00000000-0000-4000-8000-000000000002";
const actorId = "00000000-0000-4000-8000-000000000003";
const companyId = "J-12345678-9";
const documentId = "fiscal-purchase-1";
const matchId = "supplier-match-1";

/** @param {string} status @param {number} version @param {string|null} confirmedAt @returns {object} Match snapshot. */
function match(status, version, confirmedAt) {
  return {
    id: matchId,
    companyId,
    supplierId: "supplier-1",
    fiscalDocumentId: documentId,
    documentCurrency: { code: "VES", minorUnit: 2 },
    allocations: [{ fiscalLineId: "fiscal-line-1", orderLineId: null, receiptLineId: "receipt-line-1", invoicedQuantity: { amount: "1", unit: "each" }, netAmount: { minorAmount: "10000", currency: { code: "VES", minorUnit: 2 } } }],
    allocatedNetAmount: { minorAmount: "10000", currency: { code: "VES", minorUnit: 2 } },
    status,
    confirmedAt,
    version,
  };
}

/** @param {string} recognitionDate @param {string} period @returns {object} Purchase fact snapshot. */
function fact(recognitionDate = "2026-09-15", period = "2026-09") {
  return {
    id: "purchase-fact-1",
    scope: { tenantId, organizationId, companyId },
    direction: "purchase",
    source: { kind: "fiscal_document", id: documentId, lineageKey: `fiscal_document:${documentId}` },
    recognitionDate,
    period,
  };
}

/** @param {object} snapshot @returns {Promise<object>} Saved draft snapshot. */
async function saveDraft(snapshot) {
  const result = await database.query(
    "select public.shared_supplier_invoice_match_save_draft($1,$2,$3,$4::jsonb,$5) as result",
    [tenantId, organizationId, companyId, JSON.stringify(snapshot), actorId],
  );
  return result.rows[0].result;
}

/** @param {object} matchSnapshot @param {object} factSnapshot @param {string} key @returns {Promise<object>} Confirmation result. */
async function confirm(matchSnapshot, factSnapshot, key) {
  const result = await database.query(
    "select public.shared_supplier_invoice_match_confirm_with_tax_fact($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7) as result",
    [tenantId, organizationId, companyId, JSON.stringify(matchSnapshot), JSON.stringify(factSnapshot), actorId, key],
  );
  return result.rows[0].result;
}

async function expectDatabaseError(operation, code) {
  await assert.rejects(operation, (error) => String(error.message).includes(code));
}

try {
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create table public.tenants(id uuid primary key);
    create table public.organizations(id uuid primary key);
    create table public.shared_companies(tenant_id uuid not null, id text not null, organization_id uuid not null, primary key(tenant_id,id));
    create table public.organization_memberships(organization_id uuid not null, user_id uuid not null, status text not null);
    create table public.organization_delegations(id uuid primary key, client_organization_id uuid not null, status text not null, valid_from timestamptz not null, valid_until timestamptz);
    create table public.organization_delegation_member_assignments(delegation_id uuid not null, user_id uuid not null, status text not null);
    create table public.organization_delegation_scopes(delegation_id uuid not null, scope text not null);
    insert into public.tenants values ('${tenantId}');
    insert into public.organizations values ('${organizationId}');
    insert into auth.users values ('${actorId}');
    insert into public.shared_companies values ('${tenantId}','${companyId}','${organizationId}');
    insert into public.organization_memberships values ('${organizationId}','${actorId}','active');
  `);
  await database.exec(await readFile(new URL("../supabase/migrations/322_iva_reporting.sql", import.meta.url), "utf8"));
  await database.exec(`
    create table public.shared_fiscal_documents(
      tenant_id uuid not null, id text not null, organization_id uuid not null, company_id text not null,
      document_status text not null, document_snapshot jsonb not null, primary key(tenant_id,id)
    );
    create table public.shared_inventory_suppliers(
      tenant_id uuid not null, id text not null, company_id text not null, name text not null, rif text not null, active boolean not null,
      primary key(tenant_id,id)
    );
    insert into public.shared_fiscal_documents values (
      '${tenantId}','${documentId}','${organizationId}','${companyId}','received',
      '{"id":"${documentId}","direction":"received","type":"invoice","status":"received"}'::jsonb
    );
    insert into public.shared_inventory_suppliers values ('${tenantId}','supplier-1','${companyId}','Proveedor de prueba','J-12345678-9',true);
  `);
  await database.exec(await readFile(new URL("../supabase/migrations/336_supplier_invoice_match_tax_fact.sql", import.meta.url), "utf8"));
  const privileges = (await database.query(`
    select has_table_privilege('authenticated','public.shared_supplier_invoice_matches','select') as client_table_read,
      has_table_privilege('service_role','public.shared_supplier_invoice_match_commands','select') as service_table_read,
      has_function_privilege('service_role','public.shared_supplier_invoice_match_confirm_with_tax_fact(uuid,uuid,text,jsonb,jsonb,uuid,text)','execute') as service_rpc_execute,
      has_function_privilege('authenticated','public.shared_supplier_invoice_match_confirm_with_tax_fact(uuid,uuid,text,jsonb,jsonb,uuid,text)','execute') as client_rpc_execute
  `)).rows[0];
  assert.deepEqual(privileges, {
    client_table_read: false,
    service_table_read: false,
    service_rpc_execute: true,
    client_rpc_execute: false,
  });

  const draft = match("draft", 0, null);
  assert.equal((await saveDraft(draft)).replayed, false);
  assert.equal((await saveDraft(draft)).replayed, true);
  await expectDatabaseError(() => confirm(match("confirmed", 1, "2026-09-15T12:00:00Z"), fact("2026-08-31", "2026-09"), "supplier-command-1"), "PURCHASE_INVOICE_MATCH_INVALID");
  assert.equal((await database.query("select match_status from public.shared_supplier_invoice_matches where tenant_id=$1 and id=$2", [tenantId, matchId])).rows[0].match_status, "draft");
  assert.equal((await database.query("select count(*)::int as count from public.shared_tax_reporting_facts")).rows[0].count, 0);

  await expectDatabaseError(() => confirm(match("confirmed", 1, "not-an-instant"), fact(), "supplier-command-1"), "PURCHASE_INVOICE_MATCH_INVALID");
  assert.equal((await database.query("select count(*)::int as count from public.shared_tax_reporting_facts")).rows[0].count, 0);

  const confirmed = match("confirmed", 1, "2026-09-15T12:00:00Z");
  const first = await confirm(confirmed, fact(), "supplier-command-1");
  assert.equal(first.replayed, false);
  assert.equal(first.match_snapshot.status, "confirmed");
  assert.equal(first.fact_snapshot.id, "purchase-fact-1");
  const replay = await confirm(confirmed, fact(), "supplier-command-1");
  assert.equal(replay.replayed, true);
  await expectDatabaseError(() => confirm(confirmed, { ...fact(), source: { ...fact().source, lineageKey: "changed-lineage" } }, "supplier-command-1"), "PURCHASE_INVOICE_MATCH_IDEMPOTENCY_CONFLICT");
  assert.equal((await database.query("select count(*)::int as count from public.shared_tax_reporting_facts")).rows[0].count, 1);
  process.stdout.write("Supplier invoice-match SQL migration passed: scoped draft replay, recognition-period validation, atomic rollback, confirmation, and exact idempotency replay.\n");
} finally {
  await database.close();
}
