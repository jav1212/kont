import assert from "node:assert/strict";
import test from "node:test";
import { currency, exactDecimal, moneyFromDecimal, moneyToDecimal } from "@kontave/monetary-domain";
import {
  assessFaov,
  assessIncesEmployee,
  assessIncesEmployer,
  assessIvss,
  assessRpe,
  calculateAriPercentage,
  calculateIslrPaymentWithholding,
  classifyVenezuelanEarning,
  reconcileRpe,
  resolveVenezuelanRule,
  venezuelanPayrollPolicyReference,
} from "../src/index";

const VES = currency("VES", 2);
const money = (value: string) => moneyFromDecimal(value, VES);
const decimal = (value: ReturnType<typeof money>) => moneyToDecimal(value);

test("IVSS applies the five-minimum-wage ceiling and risk-specific rates", () => {
  const result = assessIvss({
    monthlyContributableIncome: money("1000"),
    monthlyMinimumWage: money("130"),
    contributionWeeks: exactDecimal("4"),
    employerRisk: "minimum",
  });
  assert.equal(decimal(result.cappedMonthlyBase), "650");
  assert.equal(decimal(result.weeklyBase), "150");
  assert.equal(decimal(result.employee), "24");
  assert.equal(decimal(result.employer), "54");
});

test("RPE applies its independent ten-minimum-wage ceiling", () => {
  const result = assessRpe({ previousMonthNormalSalary: money("2000"), monthlyMinimumWage: money("130") });
  assert.equal(decimal(result.boundedMonthlyBase), "1300");
  assert.equal(decimal(result.employee), "6.5");
  assert.equal(decimal(result.employer), "26");
});

test("RPE monthly assessment is not duplicated by biweekly payroll", () => {
  const assessed = assessRpe({ previousMonthNormalSalary: money("1000"), monthlyMinimumWage: money("130") });
  const firstHalf = reconcileRpe({ calendarMonth: "2026-08", assessment: assessed });
  const secondHalf = reconcileRpe({
    calendarMonth: "2026-08",
    assessment: assessed,
    previouslyWithheld: firstHalf.employee.currentApplication,
    previouslyContributed: firstHalf.employer.currentApplication,
  });
  assert.equal(decimal(firstHalf.employee.currentApplication), "5");
  assert.equal(decimal(secondHalf.employee.currentApplication), "0");
  assert.equal(decimal(firstHalf.employer.currentApplication), "20");
  assert.equal(decimal(secondHalf.employer.currentApplication), "0");
});

test("RPE does not manufacture the minimum base during suspension without salary", () => {
  const result = assessRpe({
    previousMonthNormalSalary: money("0"),
    monthlyMinimumWage: money("130"),
    contributionStatus: "suspended_without_salary",
  });
  assert.equal(decimal(result.boundedMonthlyBase), "0");
  assert.equal(decimal(result.employee), "0");
  assert.equal(decimal(result.employer), "0");
});

test("FAOV reconciles a monthly obligation across any number of payroll runs", () => {
  const first = assessFaov({ calendarMonth: "2026-08", accumulatedIntegralSalary: money("5000") });
  const second = assessFaov({
    calendarMonth: "2026-08",
    accumulatedIntegralSalary: money("10000"),
    previouslyWithheld: first.employee.currentApplication,
    previouslyContributed: first.employer.currentApplication,
  });
  assert.equal(decimal(first.employee.currentApplication), "50");
  assert.equal(decimal(second.employee.currentApplication), "50");
  assert.equal(decimal(second.employer.currentApplication), "100");
  assert.equal(decimal(second.employee.outstanding), "0");
});

test("FAOV total is frequency-independent for weekly, biweekly and monthly payroll", () => {
  const monthly = assessFaov({ calendarMonth: "2026-08", accumulatedIntegralSalary: money("10000") });

  let weeklyApplied = money("0");
  for (const accumulated of ["2500", "5000", "7500", "10000"]) {
    const run = assessFaov({ calendarMonth: "2026-08", accumulatedIntegralSalary: money(accumulated), previouslyWithheld: weeklyApplied });
    weeklyApplied = { ...weeklyApplied, minorAmount: weeklyApplied.minorAmount + run.employee.currentApplication.minorAmount };
  }

  const firstHalf = assessFaov({ calendarMonth: "2026-08", accumulatedIntegralSalary: money("5000") });
  const secondHalf = assessFaov({ calendarMonth: "2026-08", accumulatedIntegralSalary: money("10000"), previouslyWithheld: firstHalf.employee.currentApplication });
  const biweeklyApplied = firstHalf.employee.currentApplication.minorAmount + secondHalf.employee.currentApplication.minorAmount;

  assert.equal(weeklyApplied.minorAmount, monthly.employee.currentApplication.minorAmount);
  assert.equal(biweeklyApplied, monthly.employee.currentApplication.minorAmount);
});

test("INCES separates the employer quarter from the employee year-end event", () => {
  const ineligible = assessIncesEmployer({ calendarQuarter: "2026-Q3", accumulatedNormalSalary: money("10000"), activeWorkerCount: 4 });
  const eligible = assessIncesEmployer({ calendarQuarter: "2026-Q3", accumulatedNormalSalary: money("10000"), activeWorkerCount: 5 });
  assert.equal(decimal(ineligible.currentApplication), "0");
  assert.equal(decimal(eligible.currentApplication), "200");
  assert.equal(decimal(assessIncesEmployee({ event: "ordinary_payroll", eventAmount: money("1000") })), "0");
  assert.equal(decimal(assessIncesEmployee({ event: "profit_sharing", eventAmount: money("1000") })), "5");
});

test("AR-I uses annual estimation and applies its percentage to each taxable payment", () => {
  const result = calculateAriPercentage({
    estimatedAnnualRemuneration: money("200000"),
    taxUnitValue: money("100"),
    origin: "employee_declaration",
    singleDeductionUt: exactDecimal("774"),
  });
  assert.equal(result.estimatedAnnualRemunerationUt, "2000");
  assert.equal(result.estimatedTaxUt, "70.34");
  assert.equal(result.withholdingPercentage, "3.517");
  assert.equal(decimal(calculateIslrPaymentWithholding(money("10000"), result.withholdingPercentage)), "351.7");
});

test("regularity controls normal salary, IVSS and RPE membership", () => {
  const accidentalOvertime = classifyVenezuelanEarning({ salaryNature: "salary", regularity: "accidental", paymentNature: "earned_payment", isIncomeTaxExempt: false });
  const regularOvertime = classifyVenezuelanEarning({ salaryNature: "salary", regularity: "regular", paymentNature: "earned_payment", isIncomeTaxExempt: false });
  assert.deepEqual(accidentalOvertime, { normalSalary: false, integralSalary: true, ivss: false, rpe: false, faov: true, islr: true });
  assert.deepEqual(regularOvertime, { normalSalary: true, integralSalary: true, ivss: true, rpe: true, faov: true, islr: true });
});

test("every result can resolve the effective legal rule and sources", () => {
  const rule = resolveVenezuelanRule("VE_IVSS_EMPLOYEE", "2026-08-13");
  assert.equal(rule.assessmentPeriod, "contribution_week");
  assert.ok(rule.sources.some((source) => source.officialGazette === "39.912"));
  assert.deepEqual(venezuelanPayrollPolicyReference(rule), {
    jurisdiction: "VE", code: "VE_IVSS_EMPLOYEE", version: "2012-04-30", effectiveFrom: "2012-04-30",
  });
});
