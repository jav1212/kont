import assert from "node:assert/strict";
import test from "node:test";
import { openVatFiscalPeriod, transitionVatFiscalPeriod } from "../../src/domain/vat-fiscal-period";
import { TaxReportingFailure } from "../../src/domain/tax-reporting-failure";

const scope = { tenantId: "tenant", organizationId: "organization", companyId: "J-1" };
const command = (to: "in_review" | "prepared" | "open", version: number, idempotencyKey: string, extra: { reason?: string; declarationId?: string } = {}) => ({ to, actorId: "actor", occurredAt: "2026-10-22T12:00:00.000Z", expectedVersion: version, idempotencyKey, ...extra });

test("VAT period accepts the valid lifecycle and preserves declaration reference", () => {
  let period = openVatFiscalPeriod({ scope, periodicity: "monthly", periodKey: "2026-10" });
  period = transitionVatFiscalPeriod(period, command("in_review", 0, "review"));
  period = transitionVatFiscalPeriod(period, command("prepared", 1, "prepared", { declarationId: "declaration-r1" }));
  assert.equal(period.status, "prepared");
  assert.equal(period.declarationId, "declaration-r1");
  assert.equal(period.events.length, 2);
});

test("VAT period rejects stale writes and reopening without a reason", () => {
  const period = transitionVatFiscalPeriod(openVatFiscalPeriod({ scope, periodicity: "fortnightly", periodKey: "2026-10-Q1" }), command("in_review", 0, "review"));
  assert.throws(() => transitionVatFiscalPeriod(period, command("open", 0, "stale", { reason: "correction" })), TaxReportingFailure);
  const prepared = transitionVatFiscalPeriod(period, command("prepared", 1, "prepared", { declarationId: "declaration-r1" }));
  assert.throws(() => transitionVatFiscalPeriod(prepared, command("open", 2, "reopen")), /requires a reason/);
});
