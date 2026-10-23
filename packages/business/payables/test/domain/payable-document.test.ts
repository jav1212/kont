import assert from "node:assert/strict";
import test from "node:test";
import { exactDecimal } from "@kontave/monetary/domain";
import { payableBalance, PayablesFailure, validatePayableDocument, type PayableDocument } from "../../src/domain";

const document: PayableDocument = {
  id: "payable-1", supplierId: "supplier-1", sourceType: "manual", sourceId: "payable-1",
  kind: "manual_document", documentNumber: "F-1", concept: "Servicios", issuedAt: "2026-10-01", dueAt: "2026-10-30",
  currency: "VES", principal: exactDecimal("120.00"), rateSnapshot: { amount: exactDecimal("120.00"), baseCurrency: "VES", rate: exactDecimal("1"), source: "VES identity", effectiveDate: "2026-10-01", policyVersion: "v1", rounding: "half_up" }, status: "open", version: 1,
};

test("validates a positive payable with a reproducible rate snapshot", () => {
  assert.equal(validatePayableDocument(document), document);
});

test("rejects a due date before issue date", () => {
  assert.throws(() => validatePayableDocument({ ...document, dueAt: "2026-09-30" }), (error: unknown) => error instanceof PayablesFailure && error.code === "INVALID");
});

test("rejects a nonpositive principal", () => {
  assert.throws(() => validatePayableDocument({ ...document, principal: exactDecimal("0") }), (error: unknown) => error instanceof PayablesFailure && error.code === "INVALID");
});

test("derives balance from unreversed applications in the debt currency", () => {
  const balance = payableBalance(document, [
    { id: "retention", documentId: document.id, kind: "withholding_vat", amount: exactDecimal("20"), occurredAt: "2026-10-01" },
    { id: "reversed", documentId: document.id, kind: "payment", amount: exactDecimal("10"), occurredAt: "2026-10-01", reversedAt: "2026-10-05" },
  ]);
  assert.equal(balance.toString(), "100");
});

test("rejects applications above the immutable principal", () => {
  assert.throws(() => payableBalance(document, [{ id: "large", documentId: document.id, kind: "payment", amount: exactDecimal("121"), occurredAt: "2026-10-01" }]), (error: unknown) => error instanceof PayablesFailure && error.code === "EXCEEDS_BALANCE");
});
