import assert from "node:assert/strict";
import test from "node:test";
import { FiscalFailure } from "../../src/domain/fiscal-failure";
import { fiscalIssuanceAttempt } from "../../src/domain/persistence";
import { fiscalDocumentPageRequest } from "../../src/domain/persistence";

test("issuance attempts preserve the explicit unknown provider outcome", () => {
  const attempt = fiscalIssuanceAttempt({
    id: " attempt-1 ", documentId: " document-1 ", provider: " HKA ", idempotencyKey: " issue-1 ", state: "unknown",
    requestFingerprint: " request-fingerprint ", providerReference: " ", failureCode: " timeout ", occurredAt: " 2026-09-22T12:00:00.000Z ",
    issuedDocument: null,
  });

  assert.deepEqual(attempt, {
    id: "attempt-1", documentId: "document-1", provider: "HKA", idempotencyKey: "issue-1", state: "unknown",
    requestFingerprint: "request-fingerprint", providerReference: null, failureCode: "timeout", occurredAt: "2026-09-22T12:00:00.000Z",
    issuedDocument: null,
  });
});

test("issuance attempts reject blank idempotency keys", () => {
  assert.throws(
    () => fiscalIssuanceAttempt({
      id: "attempt-1", documentId: "document-1", provider: "HKA", idempotencyKey: " ", state: "pending",
      requestFingerprint: "request-fingerprint", providerReference: null, failureCode: null, occurredAt: "2026-09-22T12:00:00.000Z",
      issuedDocument: null,
    }),
    (error: unknown) => error instanceof FiscalFailure && error.code === "FISCAL_DOCUMENT_INVALID",
  );
});

test("fiscal document page requests enforce a bounded limit and valid cursor", () => {
  assert.deepEqual(fiscalDocumentPageRequest({ limit: 50, cursor: { createdAt: "2026-09-22T12:00:00.000Z", id: "doc-1" } }), {
    limit: 50, cursor: { createdAt: "2026-09-22T12:00:00.000Z", id: "doc-1" },
  });
  assert.throws(() => fiscalDocumentPageRequest({ limit: 101, cursor: null }));
  assert.throws(() => fiscalDocumentPageRequest({ limit: 10, cursor: { createdAt: "invalid", id: "doc-1" } }));
});
