import test from "node:test";
import assert from "node:assert/strict";
import { currency, exchangeRate } from "@kontave/monetary-domain";
import { companyId, organizationId, userId } from "@kontave/organizations-domain";
import { OperationContextFailure, createOperationalDefaults, localDate } from "../src/index";

const USD = currency("USD", 2);
const VES = currency("VES", 2);
const key = { userId: userId("user"), organizationId: organizationId("organization"), companyId: companyId("company") };

test("validates real civil dates instead of accepting rollover dates", () => {
  assert.throws(() => localDate("2026-02-30"), (cause) => cause instanceof OperationContextFailure && cause.code === "OPERATION_CONTEXT_INVALID");
});

test("accepts a previous official publication for the selected effective date", () => {
  const value = createOperationalDefaults({
    key, effectiveDate: localDate("2026-08-16"), presentationCurrency: VES.code, version: 1,
    updatedAt: "2026-08-16T12:00:00.000Z",
    exchangeRate: { status: "resolved", value: {
      rate: exchangeRate({ baseCurrency: USD, quoteCurrency: VES, value: "150.1234" }),
      effectiveDate: "2026-08-14", capturedAt: "2026-08-16T12:00:00.000Z",
      source: { kind: "official", authority: "BCV", reference: null },
    } },
  });
  assert.equal(value.exchangeRate.status, "resolved");
});

test("rejects a rate published after the operational date", () => {
  assert.throws(() => createOperationalDefaults({
    key, effectiveDate: localDate("2026-08-15"), presentationCurrency: VES.code, version: 1,
    updatedAt: "2026-08-16T12:00:00.000Z",
    exchangeRate: { status: "resolved", value: {
      rate: exchangeRate({ baseCurrency: USD, quoteCurrency: VES, value: "150" }),
      effectiveDate: "2026-08-16", capturedAt: "2026-08-16T12:00:00.000Z",
      source: { kind: "official", authority: "BCV", reference: null },
    } },
  }), OperationContextFailure);
});
