/**
 * Exercises IVA reporting migration 322 in disposable embedded PostgreSQL.
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

/** @param {string} id @returns {object} Scope-complete immutable fact snapshot. */
function fact(id) {
  return {
    id,
    scope: { tenantId, organizationId, companyId },
    direction: "sale",
    documentKind: "invoice",
    currency: { code: "VES", minorUnit: 2 },
    affectedFactId: null,
    affectedSourceId: null,
    signed: {
      taxableBase: { minorAmount: "10000" }, taxAmount: { minorAmount: "1600" },
      exemptBase: { minorAmount: "0" }, total: { minorAmount: "11600" },
    },
    rateBreakdowns: [{ taxableBase: { minorAmount: "10000" }, taxAmount: { minorAmount: "1600" } }],
    deductible: { amount: { minorAmount: "1600" } },
    source: { kind: "sales_invoice", id: "invoice-1", lineageKey: "sales:invoice-1" },
    recognitionDate: "2026-09-15",
    period: "2026-09",
  };
}

/** @param {number} revision @returns {object} Valid internal draft revision. */
function declaration(revision) {
  return {
    id: "declaration-2026-09",
    scope: { tenantId, organizationId, companyId },
    period: "2026-09",
    revision,
    status: "draft",
    voidEvidence: null,
  };
}

/** @param {string} key @param {object} snapshot @returns {Promise<object>} RPC result. */
async function appendFact(key, snapshot) {
  const result = await database.query(
    "select public.shared_tax_reporting_fact_append($1,$2,$3,$4,$5::jsonb,$6,$7) as result",
    [snapshot.scope.tenantId, snapshot.scope.organizationId, snapshot.scope.companyId, snapshot.id, JSON.stringify(snapshot), actorId, key],
  );
  return result.rows[0].result;
}

/** @param {string} key @param {object} snapshot @param {number|null} expected @returns {Promise<object>} RPC result. */
async function saveDeclaration(key, snapshot, expected = null) {
  const result = await database.query(
    "select public.shared_tax_reporting_declaration_save($1,$2,$3,$4,$5::jsonb,$6,$7,$8) as result",
    [tenantId, organizationId, companyId, snapshot.id, JSON.stringify(snapshot), actorId, key, expected],
  );
  return result.rows[0].result;
}

/** @param {object} attempt @param {object} snapshot @returns {Promise<object>} Atomic wrapper result. */
async function recordExternalIssuance(attempt, snapshot) {
  const result = await database.query(
    "select public.shared_fiscal_document_record_issuance_with_tax_fact($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7) as result",
    [tenantId, organizationId, companyId, JSON.stringify(attempt), JSON.stringify(snapshot), actorId, "external-fact-command"],
  );
  return result.rows[0].result;
}

async function expectDatabaseError(operation, code) {
  await assert.rejects(operation, (error) => String(error.message).includes(code));
}

/** @param {() => Promise<unknown>} operation @returns {Promise<void>} Ensures direct table privileges are absent. */
async function expectPermissionDenied(operation) {
  await assert.rejects(operation, (error) => error.code === "42501");
}

try {
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.shared_companies(tenant_id uuid not null, id text not null, organization_id uuid not null, primary key(tenant_id,id));
    create table public.organization_memberships(organization_id uuid not null, user_id uuid not null, status text not null);
    create table public.organization_delegations(id uuid primary key, client_organization_id uuid not null, status text not null, valid_from timestamptz not null, valid_until timestamptz);
    create table public.organization_delegation_member_assignments(delegation_id uuid not null, user_id uuid not null, status text not null);
    create table public.organization_delegation_scopes(delegation_id uuid not null, scope text not null);
    insert into public.shared_companies values ('${tenantId}','${companyId}','${organizationId}');
    insert into public.organization_memberships values ('${organizationId}','${actorId}','active');
    insert into public.shared_companies values ('00000000-0000-4000-8000-000000000099','J-99887766-5','00000000-0000-4000-8000-000000000098');
    insert into public.organization_memberships values ('00000000-0000-4000-8000-000000000098','${actorId}','active');
  `);
  await database.exec(await readFile(new URL("../supabase/migrations/322_iva_reporting.sql", import.meta.url), "utf8"));
  await database.exec(await readFile(new URL("../supabase/migrations/362_iva_correction_fact_integrity.sql", import.meta.url), "utf8"));

  const firstFact = fact("fact-1");
  assert.equal((await appendFact("fact-command-1", firstFact)).replayed, false);
  assert.equal((await appendFact("fact-command-1", firstFact)).replayed, true);
  await expectDatabaseError(() => appendFact("fact-command-1", { ...firstFact, id: "fact-other" }), "TAX_REPORTING_IDEMPOTENCY_CONFLICT");
  await expectDatabaseError(() => appendFact("fact-command-duplicate-source", { ...firstFact, id: "fact-duplicate-source" }), "TAX_REPORTING_IDEMPOTENCY_CONFLICT");

  const correction = {
    ...fact("credit-fact-1"),
    documentKind: "credit_note",
    affectedFactId: firstFact.id,
    affectedSourceId: firstFact.source.id,
    signed: {
      taxableBase: { minorAmount: "-10000" }, taxAmount: { minorAmount: "-1600" },
      exemptBase: { minorAmount: "0" }, total: { minorAmount: "-11600" },
    },
    rateBreakdowns: [{ taxableBase: { minorAmount: "-10000" }, taxAmount: { minorAmount: "-1600" } }],
    deductible: { amount: { minorAmount: "-1600" } },
    source: { kind: "sales_credit_note", id: "credit-note-1", lineageKey: "sales:credit-note-1" },
  };
  const foreignFact = {
    ...fact("foreign-tenant-fact"),
    scope: { tenantId: "00000000-0000-4000-8000-000000000099", organizationId: "00000000-0000-4000-8000-000000000098", companyId: "J-99887766-5" },
    source: { kind: "sales_invoice", id: "foreign-invoice", lineageKey: "sales:foreign-invoice" },
  };
  await appendFact("foreign-fact-command", foreignFact);
  assert.equal((await appendFact("credit-fact-command-1", correction)).fact_snapshot.affectedFactId, firstFact.id);
  await expectDatabaseError(
    () => appendFact("credit-fact-positive-tax", { ...correction, id: "credit-fact-positive-tax", signed: { ...correction.signed, taxAmount: { minorAmount: "1600" } }, rateBreakdowns: [{ taxableBase: { minorAmount: "-10000" }, taxAmount: { minorAmount: "1600" } }] }),
    "TAX_REPORTING_INVALID",
  );
  const debitCorrection = {
    ...fact("debit-fact-1"),
    documentKind: "debit_note",
    affectedFactId: firstFact.id,
    affectedSourceId: firstFact.source.id,
    source: { kind: "sales_debit_note", id: "debit-note-1", lineageKey: "sales:debit-note-1" },
  };
  assert.equal((await appendFact("debit-fact-command", debitCorrection)).fact_snapshot.signed.taxAmount.minorAmount, "1600");
  await expectDatabaseError(
    () => appendFact("debit-fact-negative-tax", { ...debitCorrection, id: "debit-fact-negative-tax", source: { kind: "sales_debit_note", id: "debit-note-negative", lineageKey: "sales:debit-note-negative" }, signed: { ...debitCorrection.signed, taxAmount: { minorAmount: "-1600" } }, rateBreakdowns: [{ taxableBase: { minorAmount: "10000" }, taxAmount: { minorAmount: "-1600" } }] }),
    "TAX_REPORTING_INVALID",
  );
  const returnSource = {
    ...fact("return-source-fact"),
    source: { kind: "sales_invoice", id: "return-original-invoice", lineageKey: "sales:return-original" },
  };
  await appendFact("return-source-command", returnSource);
  const returnCorrection = {
    ...correction,
    id: "return-fact-1",
    affectedFactId: returnSource.id,
    affectedSourceId: returnSource.source.id,
    documentKind: "return",
    source: { kind: "sales_return", id: "return-1", lineageKey: "sales:return-1" },
  };
  assert.equal((await appendFact("return-fact-command", returnCorrection)).fact_snapshot.signed.taxAmount.minorAmount, "-1600");
  const cappedSource = {
    ...fact("credit-cap-source"),
    source: { kind: "sales_invoice", id: "credit-cap-original-invoice", lineageKey: "sales:credit-cap-original" },
  };
  await appendFact("credit-cap-source-command", cappedSource);
  const partialCredit = (id) => ({
    ...fact(id),
    documentKind: "credit_note",
    affectedFactId: cappedSource.id,
    affectedSourceId: cappedSource.source.id,
    source: { kind: "sales_credit_note", id, lineageKey: `sales:${id}` },
    signed: {
      taxableBase: { minorAmount: "-5000" }, taxAmount: { minorAmount: "-800" },
      exemptBase: { minorAmount: "0" }, total: { minorAmount: "-5800" },
    },
    rateBreakdowns: [{ taxableBase: { minorAmount: "-5000" }, taxAmount: { minorAmount: "-800" } }],
    deductible: { amount: { minorAmount: "-800" } },
  });
  assert.equal((await appendFact("credit-cap-part-1-command", partialCredit("credit-cap-part-1"))).replayed, false);
  assert.equal((await appendFact("credit-cap-part-2-command", partialCredit("credit-cap-part-2"))).replayed, false);
  await expectDatabaseError(
    () => appendFact("credit-cap-exceeded-command", { ...partialCredit("credit-cap-exceeded"), signed: { taxableBase: { minorAmount: "0" }, taxAmount: { minorAmount: "-1" }, exemptBase: { minorAmount: "0" }, total: { minorAmount: "-1" } }, rateBreakdowns: [{ taxableBase: { minorAmount: "0" }, taxAmount: { minorAmount: "-1" } }], deductible: { amount: { minorAmount: "-1" } } }),
    "TAX_REPORTING_CORRECTION_EXCEEDS_SOURCE",
  );
  await expectDatabaseError(
    () => appendFact("credit-fact-missing-source", { ...correction, id: "credit-fact-missing", affectedFactId: "missing-invoice-fact" }),
    "TAX_REPORTING_CORRECTION_SOURCE_INVALID",
  );
  await expectDatabaseError(
    () => appendFact("credit-fact-foreign-source", { ...correction, id: "credit-fact-foreign", affectedFactId: foreignFact.id }),
    "TAX_REPORTING_CORRECTION_SOURCE_INVALID",
  );
  const unrelatedFact = { ...fact("unrelated-fact"), source: { kind: "sales_invoice", id: "unrelated-invoice", lineageKey: "sales:unrelated-invoice" } };
  await appendFact("unrelated-fact-command", unrelatedFact);
  await expectDatabaseError(
    () => appendFact("credit-fact-mismatched-source", { ...correction, id: "credit-fact-mismatched-source", affectedFactId: unrelatedFact.id }),
    "TAX_REPORTING_CORRECTION_SOURCE_INVALID",
  );
  await expectDatabaseError(
    () => appendFact("credit-fact-wrong-direction", { ...correction, id: "credit-fact-wrong-direction", direction: "purchase" }),
    "TAX_REPORTING_CORRECTION_SOURCE_INVALID",
  );
  await expectDatabaseError(
    () => appendFact("credit-fact-wrong-currency", { ...correction, id: "credit-fact-wrong-currency", currency: { code: "USD", minorUnit: 2 } }),
    "TAX_REPORTING_CORRECTION_SOURCE_INVALID",
  );
  await expectDatabaseError(
    () => appendFact("credit-fact-targets-correction", { ...correction, id: "credit-fact-chained", affectedFactId: correction.id }),
    "TAX_REPORTING_CORRECTION_SOURCE_INVALID",
  );

  await database.exec("set role service_role");
  await expectPermissionDenied(() => database.query("select * from public.shared_tax_reporting_facts"));
  const serviceRoleFact = { ...fact("service-role-rpc-fact"), source: { kind: "sales_invoice", id: "service-role-invoice", lineageKey: "sales:service-role-invoice" } };
  assert.equal((await appendFact("service-role-rpc-command", serviceRoleFact)).replayed, false);
  await database.exec("reset role");

  const first = await saveDeclaration("declaration-command-1", declaration(1));
  assert.equal(first.replayed, false);
  await expectDatabaseError(() => saveDeclaration("declaration-bad-scope", {
    ...declaration(1), scope: { ...declaration(1).scope, tenantId: "00000000-0000-4000-8000-000000000099" },
  }), "TAX_REPORTING_INVALID");
  await expectDatabaseError(() => saveDeclaration("declaration-bad-first-revision", declaration(2)), "TAX_REPORTING_CONCURRENCY_CONFLICT");
  assert.equal((await saveDeclaration("declaration-command-1", declaration(1))).replayed, true);
  await expectDatabaseError(() => saveDeclaration("declaration-command-1", declaration(2)), "TAX_REPORTING_IDEMPOTENCY_CONFLICT");

  const second = await saveDeclaration("declaration-command-2", declaration(2), 1);
  assert.equal(second.declaration_snapshot.revision, 2);
  const third = await saveDeclaration("declaration-command-3", declaration(3), 2);
  assert.equal(third.declaration_snapshot.revision, 3);
  await expectDatabaseError(() => saveDeclaration("declaration-skipped-revision", declaration(4), 2), "TAX_REPORTING_CONCURRENCY_CONFLICT");
  await expectDatabaseError(() => saveDeclaration("declaration-command-4", declaration(4), 1), "TAX_REPORTING_CONCURRENCY_CONFLICT");

  const revisions = await database.query("select revision from public.shared_tax_reporting_declarations order by revision");
  assert.deepEqual(revisions.rows.map((row) => row.revision), [1, 2, 3]);

  await database.exec(`
    create table public.fixture_issuance_attempts(id text primary key, document_id text not null);
    create function public.shared_fiscal_document_record_issuance_attempt(
      uuid,uuid,text,text,text,text,text,text,text,text,text,jsonb,timestamptz
    ) returns jsonb language plpgsql as $$
    begin
      insert into public.fixture_issuance_attempts(id,document_id) values ($4,$5);
      return jsonb_build_object('attempt',jsonb_build_object('id',$4,'documentId',$5,'state',$8));
    end $$;
  `);
  await database.exec(await readFile(new URL("../supabase/migrations/338_iva_atomic_fiscal_issuance.sql", import.meta.url), "utf8"));

  const issuedAttempt = {
    id: "attempt-1", documentId: "fiscal-document-1", provider: "fixture-provider",
    idempotencyKey: "provider-command-1", state: "accepted", requestFingerprint: "fingerprint-1",
    providerReference: "provider-reference-1", failureCode: null, occurredAt: "2026-09-15T12:00:00Z",
    issuedDocument: { id: "fiscal-document-1", status: "issued", direction: "issued" },
  };
  const externalFact = {
    ...fact("external-fact-1"),
    source: { kind: "fiscal_document", id: "fiscal-document-1", lineageKey: "fiscal_document:fiscal-document-1" },
  };
  await assert.rejects(
    recordExternalIssuance(issuedAttempt, { ...externalFact, recognitionDate: "not-a-date" }),
    /date/i,
  );
  assert.equal((await database.query("select count(*)::int as count from public.fixture_issuance_attempts")).rows[0].count, 0);
  const issued = await recordExternalIssuance(issuedAttempt, externalFact);
  assert.equal(issued.attempt.id, "attempt-1");
  assert.equal(issued.fact_snapshot.id, "external-fact-1");
  assert.equal((await database.query("select count(*)::int as count from public.fixture_issuance_attempts")).rows[0].count, 1);
  process.stdout.write("IVA reporting SQL migrations passed: idempotent facts, correction source/sign guards, table privilege boundary, declaration scope and revision CAS, plus external issuance/fact rollback in one transaction.\n");
} finally {
  await database.close();
}
