import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encodeFiscalDocument, SupabaseFiscalDocumentRepository } from "../../src/adapters/supabase";
import { fiscalInvoiceFixture } from "../../src/testing";

test("Supabase adapter persists exact bigint snapshots through the scoped RPC", async () => {
  const document = fiscalInvoiceFixture();
  let rpcName = "";
  let rpcArguments: Record<string, unknown> = {};
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      rpcName = name;
      rpcArguments = args;
      return {
        data: {
          document: {
            document_snapshot: args.p_document_snapshot,
          },
          replayed: false,
        },
        error: null,
      };
    },
  } as unknown as SupabaseClient;

  const result = await new SupabaseFiscalDocumentRepository(client).persist({
    scope: { tenantId: "tenant-1", organizationId: "organization-1", companyId: document.companyId },
    source: { kind: "sale", id: "sale-1" },
    document,
    idempotencyKey: "prepare-sale-1",
    actorId: "user-1",
    occurredAt: "2026-09-22T12:00:00.000Z",
  });

  assert.equal(rpcName, "shared_fiscal_document_persist_draft");
  assert.equal(rpcArguments.p_tenant_id, "tenant-1");
  assert.equal(rpcArguments.p_company_id, document.companyId);
  assert.equal(rpcArguments.p_created_by, "user-1");
  assert.equal(result.document.id, document.id);
  assert.equal(result.document.totals.payableAmount.minorAmount, document.totals.payableAmount.minorAmount);
  assert.equal(result.replayed, false);
});

test("Supabase adapter scopes document reads to tenant, organization, and company", async () => {
  let rpcArguments: Record<string, unknown> = {};
  const client = {
    async rpc(_name: string, args: Record<string, unknown>) {
      rpcArguments = args;
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;

  const found = await new SupabaseFiscalDocumentRepository(client).find({
    tenantId: "tenant-1", organizationId: "organization-1", companyId: fiscalInvoiceFixture().companyId,
  }, "document-1");

  assert.equal(found, null);
  assert.deepEqual(rpcArguments, {
    p_tenant_id: "tenant-1",
    p_organization_id: "organization-1",
    p_company_id: "fiscal-company-1",
    p_document_id: "document-1",
  });
});

test("Supabase adapter lists scoped documents with a stable keyset cursor", async () => {
  const document = fiscalInvoiceFixture();
  let rpcName = "";
  let rpcArguments: Record<string, unknown> = {};
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      rpcName = name;
      rpcArguments = args;
      return {
        data: {
          items: [{ id: document.id, created_at: "2026-09-22T12:00:00.000Z", document_snapshot: JSON.parse(encodeFiscalDocument(document)) }],
          nextCursor: { createdAt: "2026-09-22T12:00:00.000Z", id: document.id },
        },
        error: null,
      };
    },
  } as unknown as SupabaseClient;

  const page = await new SupabaseFiscalDocumentRepository(client).list({
    tenantId: "tenant-1", organizationId: "organization-1", companyId: document.companyId,
  }, { limit: 1, cursor: { createdAt: "2026-09-21T12:00:00.000Z", id: "older-document" } });

  assert.equal(rpcName, "shared_fiscal_document_list");
  assert.equal(rpcArguments.p_tenant_id, "tenant-1");
  assert.equal(rpcArguments.p_organization_id, "organization-1");
  assert.equal(rpcArguments.p_company_id, document.companyId);
  assert.equal(rpcArguments.p_limit, 1);
  assert.deepEqual(page.items.map((item) => item.document.id), [document.id]);
  assert.deepEqual(page.nextCursor, { createdAt: "2026-09-22T12:00:00.000Z", id: document.id });
});

test("Supabase adapter lists immutable audit events with a document-scoped cursor", async () => {
  let rpcName = "";
  let rpcArguments: Record<string, unknown> = {};
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      rpcName = name;
      rpcArguments = args;
      return {
        data: {
          items: [{
            id: "a1b2c3d4-e5f6-4a7b-8c9d-0123456789ab",
            event_type: "fiscal_document.prepared",
            idempotency_key: "prepare-sale-1",
            payload: { documentId: "document-1" },
            occurred_at: "2026-09-22T12:00:00.000Z",
            recorded_at: "2026-09-22T12:00:01.000Z",
          }],
          nextCursor: null,
        },
        error: null,
      };
    },
  } as unknown as SupabaseClient;

  const page = await new SupabaseFiscalDocumentRepository(client).listEvents({
    tenantId: "tenant-1", organizationId: "organization-1", companyId: fiscalInvoiceFixture().companyId,
  }, "document-1", { limit: 25, cursor: null });

  assert.equal(rpcName, "shared_fiscal_document_event_list");
  assert.equal(rpcArguments.p_document_id, "document-1");
  assert.equal(rpcArguments.p_company_id, "fiscal-company-1");
  assert.equal(page.items[0]?.eventType, "fiscal_document.prepared");
  assert.equal(page.items[0]?.payload.documentId, "document-1");
  assert.equal(page.nextCursor, null);
});

test("accepted provider attempts persist the issued aggregate with the transition", async () => {
  const draft = fiscalInvoiceFixture();
  const issued = draft.issue({
    number: "FISCAL-1",
    issuedAt: "2026-09-22T12:05:00.000Z",
    issueDate: "2026-09-22",
    evidence: {
      provider: "sandbox",
      externalDocumentNumber: "EXT-1",
      authorization: null,
      deviceRegistration: null,
    },
  });
  let rpcArguments: Record<string, unknown> = {};
  const client = {
    async rpc(_name: string, args: Record<string, unknown>) {
      rpcArguments = args;
      return {
        data: {
          attempt: {
            id: "attempt-1",
            document_id: issued.id,
            provider: "sandbox",
            idempotency_key: "issue-sale-1",
            attempt_state: "accepted",
            request_fingerprint: "fingerprint-1",
            provider_reference: "EXT-1",
            failure_code: null,
            occurred_at: "2026-09-22T12:05:00.000Z",
          },
        },
        error: null,
      };
    },
  } as unknown as SupabaseClient;

  const result = await new SupabaseFiscalDocumentRepository(client).appendIssuanceAttempt({
    tenantId: "tenant-1",
    organizationId: "organization-1",
    companyId: issued.companyId,
  }, {
    id: "attempt-1",
    documentId: issued.id,
    provider: "sandbox",
    idempotencyKey: "issue-sale-1",
    state: "accepted",
    requestFingerprint: "fingerprint-1",
    providerReference: "EXT-1",
    failureCode: null,
    occurredAt: "2026-09-22T12:05:00.000Z",
    issuedDocument: issued,
  });

  assert.equal((rpcArguments.p_issued_document_snapshot as { status: string }).status, "issued");
  assert.equal(result.state, "accepted");
  assert.equal(result.issuedDocument?.id, issued.id);
});
