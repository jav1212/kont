import assert from "node:assert/strict";
import test from "node:test";
import { currency, moneyFromDecimal } from "@kontave/monetary/domain";
import { ChangeVatDeclarationLifecycle, type VatDeclarationRepository } from "../../src/application";
import { TaxReportingFailure, vatDeclaration, type VatDeclaration } from "../../src/domain";

function preparedDeclaration(): VatDeclaration {
  const VES = currency("VES", 2);
  const zero = moneyFromDecimal("0", VES);
  return vatDeclaration({
    id: "declaration-1", scope: { tenantId: "tenant-1", organizationId: "org-1", companyId: "company-1" },
    period: "2026-09", revision: 2, status: "prepared",
    summary: { debitTax: zero, deductibleCredit: zero, withheldTax: zero, carryForwardIn: zero, adjustments: zero, payable: moneyFromDecimal("10", VES) },
    template: { id: "internal-vat", version: "1", mapping: {} }, factIds: ["fact-1"], reconciliationIssueFactIds: [],
    submittedEvidence: null, voidEvidence: null, payments: [], createdAt: "2026-09-30T00:00:00.000Z",
  });
}

test("lifecycle command persists a new revision with actor, idempotency, and compare-and-swap", async () => {
  const saved: Parameters<VatDeclarationRepository["save"]>[0][] = [];
  const repository: VatDeclarationRepository = { async save(input) { saved.push(input); return { declaration: input.declaration, replayed: false }; } };
  const current = preparedDeclaration();
  const result = await new ChangeVatDeclarationLifecycle(repository).execute({
    declaration: current,
    command: { kind: "submit", evidence: { reference: "AUTH-ACK", submittedAt: "2026-10-01T12:00:00.000Z" } },
    actorId: "actor-1", idempotencyKey: "submit-1", expectedRevision: current.revision,
  });
  assert.equal(result.declaration.status, "submitted");
  assert.equal(result.declaration.revision, 3);
  assert.equal(saved[0]?.expectedRevision, 2);
  assert.equal(saved[0]?.actorId, "actor-1");
  assert.equal(saved[0]?.idempotencyKey, "submit-1");
  await assert.rejects(() => new ChangeVatDeclarationLifecycle(repository).execute({
    declaration: current, command: { kind: "submit", evidence: { reference: "ACK-2", submittedAt: "2026-10-01T12:00:00.000Z" } },
    actorId: "actor-1", idempotencyKey: "submit-2", expectedRevision: 1,
  }), (error: unknown) => error instanceof TaxReportingFailure);
  await assert.rejects(() => new ChangeVatDeclarationLifecycle(repository).execute({
    declaration: current, command: { kind: "void", evidence: { reason: "Wrong actor", actorId: "spoofed", voidedAt: "2026-09-30T12:00:00.000Z" } },
    actorId: "actor-1", idempotencyKey: "void-1", expectedRevision: current.revision,
  }), (error: unknown) => error instanceof TaxReportingFailure);
});
