import assert from "node:assert/strict";
import test from "node:test";
import {
  currency,
  exchangeRate,
  moneyFromDecimal,
  moneyToDecimal,
  type ExchangeRateSnapshot,
} from "@kontave/monetary-domain";
import {
  assessSocioeconomicBenefit,
  CURRENT_SOCIOECONOMIC_BENEFIT_RULE,
  VenezuelanPayrollFailure,
} from "../src/index.js";

const USD = currency("USD", 2);
const VES = currency("VES", 2);
const snapshot: ExchangeRateSnapshot = {
  rate: exchangeRate({ baseCurrency: USD, quoteCurrency: VES, value: "500.1234" }),
  effectiveDate: "2026-08-31",
  capturedAt: "2026-08-31T12:00:00.000Z",
  source: { kind: "official", authority: "BCV", reference: "fixture" },
};

test("the current public socioeconomic benefit is USD 200 converted at the official payment-date rate", () => {
  const result = assessSocioeconomicBenefit({
    calendarMonth: "2026-08",
    paymentDate: "2026-08-31",
    coverage: "public_active_worker",
    settlementRateSnapshot: snapshot,
  });
  assert.equal(moneyToDecimal(CURRENT_SOCIOECONOMIC_BENEFIT_RULE.monthlyReferenceAmount), "200");
  assert.equal(result.settlementConversion.exactAmount, "100024.68");
  assert.equal(moneyToDecimal(result.reconciliation.currentPayment), "100024.68");
  assert.equal(result.salaryTreatment, "public_program_non_salary");
});

test("split payments reconcile the USD entitlement before converting each payment", () => {
  const second = assessSocioeconomicBenefit({
    calendarMonth: "2026-08",
    paymentDate: "2026-08-31",
    coverage: "public_active_worker",
    settlementRateSnapshot: snapshot,
    previouslySatisfiedReference: moneyFromDecimal("150", USD),
  });
  assert.equal(moneyToDecimal(second.reconciliation.currentReferencePayment), "50");
  assert.equal(moneyToDecimal(second.reconciliation.currentPayment), "25006.17");
  assert.equal(moneyToDecimal(second.reconciliation.outstandingReference), "0");
});

test("private adoption requires documentary authority and an explicit salary classification", () => {
  assert.throws(
    () => assessSocioeconomicBenefit({
      calendarMonth: "2026-08",
      paymentDate: "2026-08-31",
      coverage: "private_employer_adoption",
      settlementRateSnapshot: snapshot,
    }),
    (error) => error instanceof VenezuelanPayrollFailure && error.code === "VE_PAYROLL_UNSUPPORTED_CLASSIFICATION",
  );
  const result = assessSocioeconomicBenefit({
    calendarMonth: "2026-08",
    paymentDate: "2026-08-31",
    coverage: "private_employer_adoption",
    settlementRateSnapshot: snapshot,
    adoptionEvidence: {
      kind: "collective_agreement",
      reference: "CC-2026-clause-18",
      effectiveFrom: "2026-05-01",
    },
    salaryTreatment: "contractually_non_salary_subject_to_substance",
  });
  assert.equal(result.adoptionEvidence?.reference, "CC-2026-clause-18");
});

test("a private cash payment cannot borrow the public-program non-salary label", () => {
  assert.throws(
    () => assessSocioeconomicBenefit({
      calendarMonth: "2026-08",
      paymentDate: "2026-08-31",
      coverage: "private_employer_adoption",
      settlementRateSnapshot: snapshot,
      adoptionEvidence: {
        kind: "documented_employer_policy",
        reference: "POL-BEN-01",
        effectiveFrom: "2026-05-01",
      },
      salaryTreatment: "public_program_non_salary",
    }),
    (error) => error instanceof VenezuelanPayrollFailure && error.code === "VE_PAYROLL_UNSUPPORTED_CLASSIFICATION",
  );
});

test("the rule rejects non-official or future-dated rates", () => {
  assert.throws(
    () => assessSocioeconomicBenefit({
      calendarMonth: "2026-08",
      paymentDate: "2026-08-30",
      coverage: "public_active_worker",
      settlementRateSnapshot: snapshot,
    }),
    (error) => error instanceof VenezuelanPayrollFailure && error.code === "VE_PAYROLL_INVALID_INPUT",
  );
});
