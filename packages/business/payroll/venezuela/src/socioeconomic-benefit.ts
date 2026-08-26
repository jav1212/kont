import {
  convertMoney,
  currency,
  moneyFromDecimal,
  moneyFromMinor,
  sameCurrency,
  subtractMoney,
  type ExchangeRateSnapshot,
  type Money,
  type MoneyConversion,
} from "@kontave/monetary-domain";
import { VenezuelanPayrollFailure } from "./failure";
import {
  ECONOMIC_WAR_BONUS_DECREE_4805,
  SOCIOECONOMIC_INCOME_ADJUSTMENT_2026,
  type VenezuelanLegalSource,
} from "./rules";

export type SocioeconomicBenefitCoverage = "public_active_worker" | "private_employer_adoption";
export type SocioeconomicBenefitAdoptionKind =
  | "collective_agreement"
  | "individual_contract"
  | "documented_employer_policy";
export type SocioeconomicBenefitSalaryTreatment =
  | "public_program_non_salary"
  | "contractually_non_salary_subject_to_substance"
  | "salary";

export interface SocioeconomicBenefitRule {
  readonly version: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
  readonly monthlyReferenceAmount: Money;
  readonly settlement: {
    readonly kind: "official_rate_at_payment";
    readonly authority: "BCV";
    readonly quoteCurrency: ReturnType<typeof currency>;
  };
  readonly supportedCoverage: readonly SocioeconomicBenefitCoverage[];
  readonly sources: readonly VenezuelanLegalSource[];
}

export interface SocioeconomicBenefitAdoptionEvidence {
  readonly kind: SocioeconomicBenefitAdoptionKind;
  readonly reference: string;
  readonly effectiveFrom: string;
}

export interface SocioeconomicBenefitReconciliation {
  readonly assessmentKey: string;
  readonly monthlyReferenceEntitlement: Money;
  readonly previouslySatisfiedReference: Money;
  readonly currentReferencePayment: Money;
  readonly currentPayment: Money;
  readonly outstandingReference: Money;
}

export interface SocioeconomicBenefitAssessment {
  readonly calendarMonth: string;
  readonly paymentDate: string;
  readonly coverage: SocioeconomicBenefitCoverage;
  readonly rule: SocioeconomicBenefitRule;
  readonly salaryTreatment: SocioeconomicBenefitSalaryTreatment;
  readonly adoptionEvidence: SocioeconomicBenefitAdoptionEvidence | null;
  readonly settlementRateSnapshot: ExchangeRateSnapshot;
  readonly settlementConversion: MoneyConversion;
  readonly reconciliation: SocioeconomicBenefitReconciliation;
}

const USD = currency("USD", 2);
const VES = currency("VES", 2);

/** USD 200 component of the USD 240 indexed income announced for May 2026. */
export const CURRENT_SOCIOECONOMIC_BENEFIT_RULE: SocioeconomicBenefitRule = {
  version: "USD200-BCV-2026-05",
  effectiveFrom: "2026-05-01",
  effectiveUntil: null,
  monthlyReferenceAmount: moneyFromDecimal("200", USD),
  settlement: { kind: "official_rate_at_payment", authority: "BCV", quoteCurrency: VES },
  supportedCoverage: ["public_active_worker", "private_employer_adoption"],
  sources: [ECONOMIC_WAR_BONUS_DECREE_4805, SOCIOECONOMIC_INCOME_ADJUSTMENT_2026],
};

export function assessSocioeconomicBenefit(input: {
  readonly calendarMonth: string;
  readonly paymentDate: string;
  readonly coverage: SocioeconomicBenefitCoverage;
  readonly rule?: SocioeconomicBenefitRule;
  readonly settlementRateSnapshot: ExchangeRateSnapshot;
  readonly adoptionEvidence?: SocioeconomicBenefitAdoptionEvidence;
  readonly salaryTreatment?: SocioeconomicBenefitSalaryTreatment;
  readonly previouslySatisfiedReference?: Money;
}): SocioeconomicBenefitAssessment {
  requireCalendarMonth(input.calendarMonth);
  requireIsoDate(input.paymentDate, "paymentDate");
  const rule = input.rule ?? CURRENT_SOCIOECONOMIC_BENEFIT_RULE;
  validateRule(rule, input.calendarMonth);
  if (!rule.supportedCoverage.includes(input.coverage)) invalid("The selected rule does not support this worker coverage.");

  const adoptionEvidence = validateCoverage(input);
  const salaryTreatment = validateSalaryTreatment(input);
  const snapshot = input.settlementRateSnapshot;
  validateRate(rule, snapshot, input.paymentDate);
  const previous = input.previouslySatisfiedReference ?? moneyFromMinor(0n, rule.monthlyReferenceAmount.currency);
  requireSameCurrency(previous, rule.monthlyReferenceAmount);
  if (previous.minorAmount < 0n) invalid("previouslySatisfiedReference cannot be negative.");
  const referenceDifference = subtractMoney(rule.monthlyReferenceAmount, previous);
  const currentReferencePayment = referenceDifference.minorAmount > 0n
    ? referenceDifference
    : moneyFromMinor(0n, referenceDifference.currency);
  const conversion = convertMoney({ amount: currentReferencePayment, rate: snapshot.rate, roundingMode: "half_up" });
  const satisfiedAfterAssessment = moneyFromMinor(
    previous.minorAmount + currentReferencePayment.minorAmount,
    previous.currency,
  );

  return {
    calendarMonth: input.calendarMonth,
    paymentDate: input.paymentDate,
    coverage: input.coverage,
    rule,
    salaryTreatment,
    adoptionEvidence,
    settlementRateSnapshot: snapshot,
    settlementConversion: conversion,
    reconciliation: {
      assessmentKey: input.calendarMonth,
      monthlyReferenceEntitlement: rule.monthlyReferenceAmount,
      previouslySatisfiedReference: previous,
      currentReferencePayment,
      currentPayment: conversion.converted,
      outstandingReference: subtractMoney(rule.monthlyReferenceAmount, satisfiedAfterAssessment),
    },
  };
}

function validateCoverage(input: {
  readonly coverage: SocioeconomicBenefitCoverage;
  readonly adoptionEvidence?: SocioeconomicBenefitAdoptionEvidence;
  readonly calendarMonth: string;
}): SocioeconomicBenefitAdoptionEvidence | null {
  if (input.coverage === "public_active_worker") {
    if (input.adoptionEvidence) invalid("Public-program coverage does not use private adoption evidence.");
    return null;
  }
  const evidence = input.adoptionEvidence;
  if (!evidence || !evidence.reference.trim()) {
    throw new VenezuelanPayrollFailure("VE_PAYROLL_UNSUPPORTED_CLASSIFICATION", "A private employer must document the source that adopts the socioeconomic benefit.");
  }
  requireIsoDate(evidence.effectiveFrom, "adoptionEvidence.effectiveFrom");
  if (evidence.effectiveFrom > `${input.calendarMonth}-01`) invalid("Private adoption is not effective for the assessed month.");
  return evidence;
}

function validateSalaryTreatment(input: {
  readonly coverage: SocioeconomicBenefitCoverage;
  readonly salaryTreatment?: SocioeconomicBenefitSalaryTreatment;
}): SocioeconomicBenefitSalaryTreatment {
  if (input.coverage === "public_active_worker") {
    if (input.salaryTreatment && input.salaryTreatment !== "public_program_non_salary") {
      invalid("The public program uses its declared non-salary treatment.");
    }
    return "public_program_non_salary";
  }
  if (!input.salaryTreatment || input.salaryTreatment === "public_program_non_salary") {
    throw new VenezuelanPayrollFailure(
      "VE_PAYROLL_UNSUPPORTED_CLASSIFICATION",
      "A private cash benefit requires an explicit salary classification; its name does not make it non-salary under LOTTT article 105.",
    );
  }
  return input.salaryTreatment;
}

function validateRule(rule: SocioeconomicBenefitRule, calendarMonth: string): void {
  requireIsoDate(rule.effectiveFrom, "rule.effectiveFrom");
  if (rule.effectiveUntil !== null) requireIsoDate(rule.effectiveUntil, "rule.effectiveUntil");
  const assessmentDate = `${calendarMonth}-01`;
  if (assessmentDate < rule.effectiveFrom || (rule.effectiveUntil !== null && assessmentDate > rule.effectiveUntil)) {
    throw new VenezuelanPayrollFailure("VE_PAYROLL_RULE_NOT_EFFECTIVE", `Socioeconomic benefit ${rule.version} is not effective for ${calendarMonth}.`);
  }
  if (rule.monthlyReferenceAmount.minorAmount <= 0n || !rule.version.trim() || rule.sources.length === 0) invalid("Invalid socioeconomic benefit rule.");
}

function validateRate(rule: SocioeconomicBenefitRule, snapshot: ExchangeRateSnapshot, paymentDate: string): void {
  if (snapshot.source.kind !== "official" || snapshot.source.authority.trim().toUpperCase() !== rule.settlement.authority) {
    throw new VenezuelanPayrollFailure("VE_PAYROLL_MISSING_EXCHANGE_RATE", "The socioeconomic benefit requires an official BCV rate.");
  }
  if (snapshot.effectiveDate > paymentDate) invalid("The BCV rate effective date cannot be after the payment date.");
  if (!sameCurrency(snapshot.rate.baseCurrency, rule.monthlyReferenceAmount.currency)
    || !sameCurrency(snapshot.rate.quoteCurrency, rule.settlement.quoteCurrency)) {
    throw new VenezuelanPayrollFailure("VE_PAYROLL_CURRENCY_MISMATCH", "The socioeconomic benefit requires a USD/VES rate.");
  }
}

function requireSameCurrency(left: Money, right: Money): void {
  if (!sameCurrency(left.currency, right.currency)) throw new VenezuelanPayrollFailure("VE_PAYROLL_CURRENCY_MISMATCH", "Benefit payment currencies differ.");
}
function requireCalendarMonth(value: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) invalid("calendarMonth must use YYYY-MM.");
}
function requireIsoDate(value: string, name: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(value)) invalid(`${name} must use YYYY-MM-DD.`);
}
function invalid(message: string): never {
  throw new VenezuelanPayrollFailure("VE_PAYROLL_INVALID_INPUT", message);
}
