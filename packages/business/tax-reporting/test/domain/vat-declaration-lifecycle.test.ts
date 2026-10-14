import assert from "node:assert/strict";
import test from "node:test";
import { currency, moneyFromDecimal } from "@kontave/monetary/domain";
import { recordVatDeclarationPayment, submitVatDeclaration, vatDeclaration, voidVatDeclaration, type VatDeclaration } from "../../src/domain";

function declaration(): VatDeclaration {
  const VES = currency("VES", 2);
  const zero = moneyFromDecimal("0", VES);
  return vatDeclaration({
    id: "declaration-1", scope: { tenantId: "tenant-1", organizationId: "org-1", companyId: "company-1" },
    period: "2026-09", revision: 1, status: "prepared",
    summary: { debitTax: zero, deductibleCredit: zero, withheldTax: zero, carryForwardIn: zero, adjustments: zero, payable: moneyFromDecimal("16", zero.currency) },
    template: { id: "internal-vat", version: "1", mapping: {} }, factIds: ["fact-1"], reconciliationIssueFactIds: [],
    submittedEvidence: null, voidEvidence: null, payments: [], createdAt: "2026-09-30T00:00:00.000Z",
  });
}

test("submission and payments append lifecycle revisions until the exact payable is settled", () => {
  const submitted = submitVatDeclaration(declaration(), { reference: "SENIAT-ACK-1", submittedAt: "2026-10-01T12:00:00.000Z" });
  const partial = recordVatDeclarationPayment(submitted, { reference: "BANK-1", amount: moneyFromDecimal("6", submitted.summary.payable.currency), paidAt: "2026-10-02T12:00:00.000Z" });
  const paid = recordVatDeclarationPayment(partial, { reference: "BANK-2", amount: moneyFromDecimal("10", partial.summary.payable.currency), paidAt: "2026-10-03T12:00:00.000Z" });
  assert.deepEqual([submitted.status, partial.status, paid.status], ["submitted", "submitted", "paid"]);
  assert.deepEqual([submitted.revision, partial.revision, paid.revision], [2, 3, 4]);
  assert.equal(paid.payments.length, 2);
  assert.equal(declaration().status, "prepared");
});

test("payment rejects overpayment, duplicate references, and payment before submission", () => {
  const base = declaration();
  const payment = { reference: "BANK-1", amount: moneyFromDecimal("17", base.summary.payable.currency), paidAt: "2026-10-02T12:00:00.000Z" };
  assert.throws(() => recordVatDeclarationPayment(base, payment));
  const submitted = submitVatDeclaration(base, { reference: "ACK-1", submittedAt: "2026-10-01T12:00:00.000Z" });
  const paid = recordVatDeclarationPayment(submitted, { ...payment, amount: moneyFromDecimal("16", base.summary.payable.currency) });
  assert.throws(() => recordVatDeclarationPayment(paid, { ...payment, amount: moneyFromDecimal("1", base.summary.payable.currency) }));
  const partial = recordVatDeclarationPayment(submitted, { ...payment, amount: moneyFromDecimal("6", base.summary.payable.currency) });
  assert.throws(() => recordVatDeclarationPayment(partial, { ...payment, amount: moneyFromDecimal("1", base.summary.payable.currency) }));
});

test("voiding is explicit and cannot erase external submission evidence", () => {
  const voided = voidVatDeclaration(declaration(), { reason: "Duplicated internal preparation", actorId: "actor-1", voidedAt: "2026-09-30T15:00:00.000Z" });
  assert.equal(voided.status, "void");
  assert.equal(voided.voidEvidence?.reason, "Duplicated internal preparation");
  assert.equal(voided.revision, 2);
  const submitted = submitVatDeclaration(declaration(), { reference: "ACK-1", submittedAt: "2026-10-01T12:00:00.000Z" });
  assert.throws(() => voidVatDeclaration(submitted, { reason: "attempt", actorId: "actor-1", voidedAt: "2026-10-02T00:00:00.000Z" }));
});

test("persisted lifecycle snapshots reject paid status without exact settlement evidence", () => {
  const submitted = submitVatDeclaration(declaration(), { reference: "ACK-1", submittedAt: "2026-10-01T12:00:00.000Z" });
  const settled = recordVatDeclarationPayment(submitted, { reference: "BANK-1", amount: moneyFromDecimal("16", submitted.summary.payable.currency), paidAt: "2026-10-02T12:00:00.000Z" });
  assert.throws(() => vatDeclaration({ ...settled, payments: [] }));
  assert.throws(() => vatDeclaration({ ...settled, status: "submitted" }));
});
