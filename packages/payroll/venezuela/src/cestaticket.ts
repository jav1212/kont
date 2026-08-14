import {
  compareDecimal,
  convertMoney,
  currency,
  divideDecimal,
  exactDecimal,
  moneyFromDecimal,
  moneyToDecimal,
  multiplyDecimal,
  quantizeMoney,
  sameCurrency,
  type ExactDecimal,
  type ExchangeRateSnapshot,
  type Money,
  type MoneyConversion,
} from "@kontave/monetary-domain";
import { reconcileStatutoryObligation, type StatutoryObligationAssessment } from "./assessment.js";
import { VenezuelanPayrollFailure } from "./failure.js";
import {
  CESTATICKET_DECREE_4805,
  CESTATICKET_EXECUTIVE_ADJUSTMENT_2023,
  CESTATICKET_LAW_2015,
  CESTATICKET_REGULATION_2013,
  CESTATICKET_SCS_250_2026,
  CESTATICKET_SCS_371_2025,
  CESTATICKET_SCS_712_2024,
  type VenezuelanLegalSource,
} from "./rules.js";

export type CestaticketAmountAuthority =
  | "official_gazette"
  | "judicial_precedent"
  | "administrative_instruction"
  | "employer_more_favorable";

export interface CestaticketAmountRule {
  readonly version: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
  readonly monthlyReferenceAmount: Money;
  readonly settlement:
    | { readonly kind: "same_currency" }
    | { readonly kind: "official_rate_at_payment"; readonly authority: "BCV"; readonly quoteCurrency: ReturnType<typeof currency> };
  readonly authority: CestaticketAmountAuthority;
  readonly sources: readonly VenezuelanLegalSource[];
}

const VES = currency("VES", 2);
const USD = currency("USD", 2);

/** The last amount directly fixed by the supplied official Gazette. */
export const CESTATICKET_GAZETTED_AMOUNT_2023: CestaticketAmountRule = {
  version: "D4805-2023-05-01",
  effectiveFrom: "2023-05-01",
  effectiveUntil: null,
  monthlyReferenceAmount: moneyFromDecimal("1000", VES),
  settlement: { kind: "same_currency" },
  authority: "official_gazette",
  sources: [CESTATICKET_LAW_2015, CESTATICKET_REGULATION_2013, CESTATICKET_DECREE_4805],
};

/** Current operational rule, repeatedly recognized by the Social Cassation Chamber. */
export const CESTATICKET_CURRENT_AMOUNT: CestaticketAmountRule = {
  version: "USD40-BCV-SCS-250-2026",
  effectiveFrom: "2023-05-01",
  effectiveUntil: null,
  monthlyReferenceAmount: moneyFromDecimal("40", USD),
  settlement: { kind: "official_rate_at_payment", authority: "BCV", quoteCurrency: VES },
  authority: "judicial_precedent",
  sources: [
    CESTATICKET_LAW_2015,
    CESTATICKET_REGULATION_2013,
    CESTATICKET_DECREE_4805,
    CESTATICKET_EXECUTIVE_ADJUSTMENT_2023,
    CESTATICKET_SCS_712_2024,
    CESTATICKET_SCS_371_2025,
    CESTATICKET_SCS_250_2026,
  ],
};

export type CestaticketAbsenceKind =
  | "worker_attributable"
  | "employer_attributable"
  | "personal_natural_disaster"
  | "vacation"
  | "temporary_disability_up_to_12_months"
  | "maternity_leave"
  | "paternity_leave";

export interface CestaticketAbsence {
  readonly kind: CestaticketAbsenceKind;
  readonly days: number;
}

export type CestaticketGrantMode = "coupon" | "electronic_card" | "cash";
export type CestaticketMealGrantMode = "own_canteen" | "contracted_meal" | "shared_canteen" | "public_nutrition_canteen";
export type CestaticketCashException =
  | "under_20_workers_and_other_modes_disproportionate"
  | "no_practical_access_to_affiliated_food_establishments"
  | "temporary_substitution_during_protected_absence";

export type CestaticketSalaryTreatment = "statutory_non_salary" | "recognized_as_salary_by_agreement";

export interface CestaticketGrantArrangement {
  readonly mode: CestaticketGrantMode | CestaticketMealGrantMode;
  readonly cashException: CestaticketCashException | null;
  readonly requiresLabourInspectorNotificationEvidence: boolean;
  readonly permitsPartTimeMonetaryProration: boolean;
}

export interface CestaticketAssessment {
  readonly calendarMonth: string;
  readonly paymentDate: string;
  readonly grantDueOn: string;
  readonly amountRule: CestaticketAmountRule;
  readonly grantMode: CestaticketGrantMode;
  readonly cashException: CestaticketCashException | null;
  readonly salaryTreatment: CestaticketSalaryTreatment;
  readonly fullMonthlyAmount: Money;
  readonly partTimeFraction: ExactDecimal;
  readonly workerAttributableAbsenceDays: number;
  readonly protectedAbsenceDays: number;
  readonly absenceDeduction: Money;
  readonly monthlyEntitlement: Money;
  readonly settlementConversion: MoneyConversion | null;
  readonly settlementRateSnapshot: ExchangeRateSnapshot | null;
  readonly reconciliation: StatutoryObligationAssessment;
}

export function defineCestaticketAmountRule(input: CestaticketAmountRule): CestaticketAmountRule {
  requireIsoDate(input.effectiveFrom, "effectiveFrom");
  if (input.effectiveUntil !== null) {
    requireIsoDate(input.effectiveUntil, "effectiveUntil");
    if (input.effectiveUntil < input.effectiveFrom) invalid("effectiveUntil cannot precede effectiveFrom.");
  }
  if (!input.version.trim() || input.monthlyReferenceAmount.minorAmount <= 0n || input.sources.length === 0) {
    invalid("An amount rule requires a version, positive amount and legal source.");
  }
  return input;
}

export function validateCestaticketGrantArrangement(input: {
  readonly mode: CestaticketGrantMode | CestaticketMealGrantMode;
  readonly cashException?: CestaticketCashException;
  readonly employerWorkerCount?: number;
  readonly inspectorNotificationRecorded?: boolean;
}): CestaticketGrantArrangement {
  validateGrantMode({
    grantMode: input.mode,
    ...(input.cashException === undefined ? {} : { cashException: input.cashException }),
    ...(input.employerWorkerCount === undefined ? {} : { employerWorkerCount: input.employerWorkerCount }),
    ...(input.inspectorNotificationRecorded === undefined ? {} : { inspectorNotificationRecorded: input.inspectorNotificationRecorded }),
  });
  const cashException = input.cashException ?? null;
  return {
    mode: input.mode,
    cashException,
    requiresLabourInspectorNotificationEvidence: input.mode === "cash" && cashException !== "temporary_substitution_during_protected_absence",
    permitsPartTimeMonetaryProration: input.mode === "coupon" || input.mode === "electronic_card" || input.mode === "cash",
  };
}

export function assessCestaticket(input: {
  readonly calendarMonth: string;
  readonly paymentDate: string;
  readonly amountRule: CestaticketAmountRule;
  readonly absences?: readonly CestaticketAbsence[];
  readonly grantMode: CestaticketGrantMode;
  readonly cashException?: CestaticketCashException;
  readonly employerWorkerCount?: number;
  readonly inspectorNotificationRecorded?: boolean;
  readonly salaryTreatment?: CestaticketSalaryTreatment;
  readonly partTimeFraction?: ExactDecimal;
  readonly settlementRateSnapshot?: ExchangeRateSnapshot;
  readonly previouslyGranted?: Money;
}): CestaticketAssessment {
  requireCalendarMonth(input.calendarMonth);
  requireIsoDate(input.paymentDate, "paymentDate");
  const rule = defineCestaticketAmountRule(input.amountRule);
  const assessmentDate = `${input.calendarMonth}-01`;
  if (assessmentDate < rule.effectiveFrom || (rule.effectiveUntil !== null && assessmentDate > rule.effectiveUntil)) {
    throw new VenezuelanPayrollFailure("VE_PAYROLL_RULE_NOT_EFFECTIVE", `Cestaticket amount ${rule.version} is not effective for ${input.calendarMonth}.`);
  }
  validateCestaticketGrantArrangement({
    mode: input.grantMode,
    ...(input.cashException === undefined ? {} : { cashException: input.cashException }),
    ...(input.employerWorkerCount === undefined ? {} : { employerWorkerCount: input.employerWorkerCount }),
    ...(input.inspectorNotificationRecorded === undefined ? {} : { inspectorNotificationRecorded: input.inspectorNotificationRecorded }),
  });
  const partTimeFraction = input.partTimeFraction ?? exactDecimal("1");
  if (compareDecimal(partTimeFraction, exactDecimal("0")) <= 0 || compareDecimal(partTimeFraction, exactDecimal("1")) > 0) {
    invalid("partTimeFraction must be greater than zero and at most one.");
  }

  let attributableDays = 0;
  let protectedDays = 0;
  for (const absence of input.absences ?? []) {
    requireDayCount(absence.days);
    if (absence.kind === "worker_attributable") attributableDays += absence.days;
    else protectedDays += absence.days;
  }
  if (attributableDays + protectedDays > 30) invalid("Cestaticket absence days cannot exceed 30 in one month.");
  if (input.cashException === "temporary_substitution_during_protected_absence" && protectedDays === 0) {
    invalidMode("Temporary cash substitution requires a protected absence in the assessed month.");
  }

  const settledReference = settleReferenceAmount(rule, input.paymentDate, input.settlementRateSnapshot);
  const fullMonthlyAmount = quantizeMoney(
    multiplyDecimal(moneyToDecimal(settledReference), partTimeFraction),
    settledReference.currency,
    "half_up",
  );
  const absenceDeduction = quantizeMoney(
    multiplyDecimal(divideDecimal(moneyToDecimal(fullMonthlyAmount), exactDecimal("30")), exactDecimal(String(attributableDays))),
    fullMonthlyAmount.currency,
    "half_up",
  );
  const monthlyEntitlement = {
    ...fullMonthlyAmount,
    minorAmount: fullMonthlyAmount.minorAmount - absenceDeduction.minorAmount,
  };
  const previous = input.previouslyGranted;
  if (previous && !sameCurrency(previous.currency, monthlyEntitlement.currency)) {
    throw new VenezuelanPayrollFailure("VE_PAYROLL_CURRENCY_MISMATCH", "Previously granted Cestaticket uses another currency.");
  }
  const conversion = input.settlementRateSnapshot
    ? convertMoney({ amount: rule.monthlyReferenceAmount, rate: input.settlementRateSnapshot.rate, roundingMode: "half_up" })
    : null;

  return {
    calendarMonth: input.calendarMonth,
    paymentDate: input.paymentDate,
    grantDueOn: fifthDayAfterMonthEnd(input.calendarMonth),
    amountRule: rule,
    grantMode: input.grantMode,
    cashException: input.cashException ?? null,
    salaryTreatment: input.salaryTreatment ?? "statutory_non_salary",
    fullMonthlyAmount,
    partTimeFraction,
    workerAttributableAbsenceDays: attributableDays,
    protectedAbsenceDays: protectedDays,
    absenceDeduction,
    monthlyEntitlement,
    settlementConversion: conversion,
    settlementRateSnapshot: input.settlementRateSnapshot ?? null,
    reconciliation: reconcileStatutoryObligation({
      code: "VE_CESTATICKET_SOCIALISTA",
      assessmentKey: input.calendarMonth,
      assessedToDate: monthlyEntitlement,
      ...(previous === undefined ? {} : { previouslyApplied: previous }),
    }),
  };
}

function settleReferenceAmount(rule: CestaticketAmountRule, paymentDate: string, snapshot?: ExchangeRateSnapshot): Money {
  const amount = rule.monthlyReferenceAmount;
  if (rule.settlement.kind === "same_currency") {
    if (snapshot) invalid("A same-currency Cestaticket rule must not receive an exchange rate.");
    return amount;
  }
  if (!snapshot) {
    throw new VenezuelanPayrollFailure("VE_PAYROLL_MISSING_EXCHANGE_RATE", "The current Cestaticket rule requires the official BCV rate for the effective payment date.");
  }
  if (snapshot.source.kind !== "official" || snapshot.source.authority.trim().toUpperCase() !== rule.settlement.authority) {
    throw new VenezuelanPayrollFailure("VE_PAYROLL_MISSING_EXCHANGE_RATE", "Cestaticket settlement requires an official BCV exchange-rate snapshot.");
  }
  if (snapshot.effectiveDate > paymentDate) {
    invalid("The BCV rate effective date cannot be after the effective payment date.");
  }
  if (!sameCurrency(amount.currency, snapshot.rate.baseCurrency) || !sameCurrency(rule.settlement.quoteCurrency, snapshot.rate.quoteCurrency)) {
    throw new VenezuelanPayrollFailure("VE_PAYROLL_CURRENCY_MISMATCH", "Cestaticket amount and exchange-rate base currency differ.");
  }
  return convertMoney({ amount, rate: snapshot.rate, roundingMode: "half_up" }).converted;
}

function validateGrantMode(input: {
  readonly grantMode: CestaticketGrantMode | CestaticketMealGrantMode;
  readonly cashException?: CestaticketCashException;
  readonly employerWorkerCount?: number;
  readonly inspectorNotificationRecorded?: boolean;
}): void {
  if (input.grantMode !== "cash") {
    if (input.cashException) invalidMode("A cash exception cannot accompany a coupon or electronic-card grant.");
    return;
  }
  if (!input.cashException) invalidMode("Cash requires one of the statutory exceptions; employee preference is not an exception.");
  if (input.cashException === "under_20_workers_and_other_modes_disproportionate") {
    if (!Number.isInteger(input.employerWorkerCount) || input.employerWorkerCount === undefined || input.employerWorkerCount < 0 || input.employerWorkerCount >= 20) {
      invalidMode("The under-20 cash exception requires a verified worker count below 20.");
    }
  }
  if (input.cashException !== "temporary_substitution_during_protected_absence" && !input.inspectorNotificationRecorded) {
    invalidMode("Cash exceptions under article 5(1) or 5(2) require evidence of notification to the Labour Inspectorate.");
  }
}

function requireDayCount(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 30) invalid("Absence days must be an integer from 0 to 30.");
}
function requireCalendarMonth(value: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) invalid("calendarMonth must use YYYY-MM.");
}
function requireIsoDate(value: string, name: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(value)) invalid(`${name} must use YYYY-MM-DD.`);
}
function fifthDayAfterMonthEnd(calendarMonth: string): string {
  const [year, month] = calendarMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month!, 5));
  return date.toISOString().slice(0, 10);
}
function invalid(message: string): never {
  throw new VenezuelanPayrollFailure("VE_PAYROLL_INVALID_INPUT", message);
}
function invalidMode(message: string): never {
  throw new VenezuelanPayrollFailure("VE_PAYROLL_INVALID_GRANT_MODE", message);
}
