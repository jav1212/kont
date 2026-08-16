import assert from "node:assert/strict";
import test from "node:test";
import {
  currency,
  exactDecimal,
  exchangeRate,
  moneyFromDecimal,
  moneyToDecimal,
  type ExchangeRateSnapshot,
} from "@kontave/monetary-domain";
import {
  assessCestaticket,
  CESTATICKET_CURRENT_AMOUNT,
  CESTATICKET_GAZETTED_AMOUNT_2023,
  CESTATICKET_LAW_2015,
  defineCestaticketAmountRule,
  resolveVenezuelanRule,
  validateCestaticketGrantArrangement,
  VenezuelanPayrollFailure,
} from "../src/index";

const VES = currency("VES", 2);
const USD = currency("USD", 2);
const asDecimal = (value: ReturnType<typeof moneyFromDecimal>) => moneyToDecimal(value);

const snapshot: ExchangeRateSnapshot = {
  rate: exchangeRate({ baseCurrency: USD, quoteCurrency: VES, value: "36.4512" }),
  effectiveDate: "2026-08-31",
  capturedAt: "2026-08-31T12:00:00.000Z",
  source: { kind: "official", authority: "BCV", reference: "fixture" },
};

const judiciallyRecognizedUsd40 = defineCestaticketAmountRule({
  version: "SCS-712-2024",
  effectiveFrom: "2024-12-19",
  effectiveUntil: null,
  monthlyReferenceAmount: moneyFromDecimal("40", USD),
  settlement: { kind: "official_rate_at_payment", authority: "BCV", quoteCurrency: VES },
  authority: "judicial_precedent",
  sources: [{
    id: "VE-TSJ-SCS-712-2024",
    title: "Sentencia 712 de la Sala de Casación Social",
    authorityKind: "judicial_precedent",
    officialGazette: "not_applicable",
    publishedOn: "2024-12-19",
    articles: ["dispositivo"],
  }],
});

test("the gazetted historical amount remains traceable while USD 40 is the current operational rule", () => {
  assert.equal(asDecimal(CESTATICKET_GAZETTED_AMOUNT_2023.monthlyReferenceAmount), "1000");
  assert.equal(CESTATICKET_GAZETTED_AMOUNT_2023.authority, "official_gazette");
  assert.equal(asDecimal(CESTATICKET_CURRENT_AMOUNT.monthlyReferenceAmount), "40");
  assert.equal(CESTATICKET_CURRENT_AMOUNT.settlement.kind, "official_rate_at_payment");
});

test("an explicit foreign-currency rule keeps the complete BCV rate and rounds only the monetary result", () => {
  const result = assessCestaticket({
    calendarMonth: "2026-08",
    paymentDate: "2026-08-31",
    amountRule: judiciallyRecognizedUsd40,
    grantMode: "electronic_card",
    settlementRateSnapshot: snapshot,
  });
  assert.equal(result.settlementConversion?.exactAmount, "1458.048");
  assert.equal(asDecimal(result.monthlyEntitlement), "1458.05");
  assert.equal(result.settlementRateSnapshot?.rate.publishedScale, 4);
});

test("only worker-attributable absences reduce one thirtieth per day", () => {
  const result = assessCestaticket({
    calendarMonth: "2026-08",
    paymentDate: "2026-08-31",
    amountRule: judiciallyRecognizedUsd40,
    grantMode: "electronic_card",
    settlementRateSnapshot: snapshot,
    absences: [
      { kind: "worker_attributable", days: 2 },
      { kind: "vacation", days: 5 },
      { kind: "temporary_disability_up_to_12_months", days: 3 },
    ],
  });
  assert.equal(result.workerAttributableAbsenceDays, 2);
  assert.equal(result.protectedAbsenceDays, 8);
  assert.equal(asDecimal(result.absenceDeduction), "97.2");
  assert.equal(asDecimal(result.monthlyEntitlement), "1360.85");
});

test("the monthly assessment reconciles without depending on weekly or biweekly runs", () => {
  const first = assessCestaticket({
    calendarMonth: "2026-08",
    paymentDate: "2026-08-31",
    amountRule: CESTATICKET_GAZETTED_AMOUNT_2023,
    grantMode: "electronic_card",
  });
  const second = assessCestaticket({
    calendarMonth: "2026-08",
    paymentDate: "2026-08-31",
    amountRule: CESTATICKET_GAZETTED_AMOUNT_2023,
    grantMode: "electronic_card",
    previouslyGranted: first.reconciliation.currentApplication,
  });
  assert.equal(asDecimal(first.reconciliation.currentApplication), "1000");
  assert.equal(asDecimal(second.reconciliation.currentApplication), "0");
});

test("part-time monetary grants can use an explicit hours fraction", () => {
  const result = assessCestaticket({
    calendarMonth: "2026-08",
    paymentDate: "2026-08-31",
    amountRule: CESTATICKET_GAZETTED_AMOUNT_2023,
    grantMode: "electronic_card",
    partTimeFraction: exactDecimal("0.5"),
  });
  assert.equal(asDecimal(result.monthlyEntitlement), "500");
});

test("the current rule cannot be assessed without the official BCV rate for payment", () => {
  assert.throws(
    () => assessCestaticket({
      calendarMonth: "2026-08",
      paymentDate: "2026-08-31",
      amountRule: CESTATICKET_CURRENT_AMOUNT,
      grantMode: "electronic_card",
    }),
    (error) => error instanceof VenezuelanPayrollFailure && error.code === "VE_PAYROLL_MISSING_EXCHANGE_RATE",
  );
});

test("cash is rejected without a statutory exception and its evidence", () => {
  assert.throws(
    () => validateCestaticketGrantArrangement({ mode: "cash" }),
    (error) => error instanceof VenezuelanPayrollFailure && error.code === "VE_PAYROLL_INVALID_GRANT_MODE",
  );
  assert.throws(
    () => validateCestaticketGrantArrangement({
      mode: "cash",
      cashException: "under_20_workers_and_other_modes_disproportionate",
      employerWorkerCount: 12,
    }),
    (error) => error instanceof VenezuelanPayrollFailure && error.code === "VE_PAYROLL_INVALID_GRANT_MODE",
  );
  assert.doesNotThrow(() => validateCestaticketGrantArrangement({
    mode: "cash",
    cashException: "under_20_workers_and_other_modes_disproportionate",
    employerWorkerCount: 12,
    inspectorNotificationRecorded: true,
  }));
});

test("Cestaticket is a worker benefit and not a payroll deduction", () => {
  const rule = resolveVenezuelanRule("VE_CESTATICKET_SOCIALISTA", "2026-08-13");
  assert.equal(rule.assessmentPeriod, "calendar_month");
  assert.equal(rule.collectingEntity, "WORKER");
  assert.equal(rule.liableParty, "employer");
  assert.ok(rule.sources.some((source) => source.id === CESTATICKET_LAW_2015.id));
});
