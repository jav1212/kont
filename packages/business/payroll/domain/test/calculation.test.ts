import assert from "node:assert/strict";
import test from "node:test";
import { employeeId } from "@kontave/employees-domain";
import { currency, moneyFromDecimal } from "@kontave/monetary-domain";
import {
  calculatePayrollRelationship, decimalInput, moneyInput, orderDefinitions, payrollElementCode, payrollElementDefinition,
  payrollElementEntry, payrollElementEntryId, payrollPeriod, payrollRelationshipId, type PayrollElementDefinition, type PayrollWorkerSnapshot,
} from "../src/index";

const VES = currency("VES", 2); const relationshipId = payrollRelationshipId("rel-1");
const period = payrollPeriod({ start: "2026-08-01", end: "2026-08-15", paymentDate: "2026-08-15", frequency: "biweekly", sequence: "2026-08-Q1" });
const worker: PayrollWorkerSnapshot = { relationshipId, employeeId: employeeId("emp-1"), nationalId: "V1", displayName: "Ada", position: "Analista", compensation: [] };
const REGULAR = payrollElementCode("CORE.REGULAR"); const OVERTIME = payrollElementCode("CORE.OVERTIME"); const DEDUCTION = payrollElementCode("CORE.DEDUCTION");
const definitions: PayrollElementDefinition[] = [
  payrollElementDefinition({ code: DEDUCTION, name: "Deduction", classification: "employee_deduction", phase: "employee_deductions", priority: 1, unit: "money", recurrence: "recurring", effectiveFrom: "2026-01-01", effectiveUntil: null, dependsOn: [REGULAR], evaluator: { kind: "percentage_of_element", elementCode: REGULAR, percentageInput: "percentage" }, balanceFeeds: [] }),
  payrollElementDefinition({ code: OVERTIME, name: "Overtime", classification: "supplemental_earning", phase: "supplemental_earnings", priority: 1, unit: "money", recurrence: "non_recurring", effectiveFrom: "2026-01-01", effectiveUntil: null, dependsOn: [], evaluator: { kind: "quantity_by_rate", quantityInput: "hours", rateInput: "rate" }, balanceFeeds: [] }),
  payrollElementDefinition({ code: REGULAR, name: "Regular", classification: "regular_earning", phase: "base_earnings", priority: 1, unit: "money", recurrence: "recurring", effectiveFrom: "2026-01-01", effectiveUntil: null, dependsOn: [], evaluator: { kind: "fixed_amount", amountInput: "amount" }, balanceFeeds: [] }),
];
const entries = [
  payrollElementEntry({ id: payrollElementEntryId("regular"), relationshipId, elementCode: REGULAR, effectiveFrom: "2026-08-01", effectiveUntil: null, origin: "compensation", values: [moneyInput("amount", moneyFromDecimal("1000.00", VES))] }),
  payrollElementEntry({ id: payrollElementEntryId("overtime"), relationshipId, elementCode: OVERTIME, effectiveFrom: "2026-08-01", effectiveUntil: null, origin: "time", values: [decimalInput("hours", "3"), moneyInput("rate", moneyFromDecimal("10.125", currency("VES", 3)))] }),
  payrollElementEntry({ id: payrollElementEntryId("deduction"), relationshipId, elementCode: DEDUCTION, effectiveFrom: "2026-08-01", effectiveUntil: null, origin: "legislation", values: [decimalInput("percentage", "4")] }),
];

test("orders dependencies and calculates an auditable gross-to-net result", () => {
  // Replace the overtime rate with the settlement currency scale for this scenario.
  const compatible = entries.map((entry) => entry.elementCode === OVERTIME ? { ...entry, values: [decimalInput("hours", "3"), moneyInput("rate", moneyFromDecimal("10.12", VES))] } : entry);
  const result = calculatePayrollRelationship({ worker, settlementCurrency: VES, period, definitions, entries: compatible, policyReferences: [] });
  assert.deepEqual(result.elements.map((element) => element.elementCode), [REGULAR, OVERTIME, DEDUCTION]);
  assert.equal(result.balances.grossEarnings.minorAmount, 103_036n);
  assert.equal(result.balances.employeeDeductions.minorAmount, 4_000n);
  assert.equal(result.balances.netPay.minorAmount, 99_036n);
  assert.equal(result.elements[1]?.trace.exactResult, "30.36");
});

test("rejects cycles before evaluating money", () => {
  const cycle = definitions.slice(0, 2).map((definition, index, rows) => ({ ...definition, dependsOn: [rows[index === 0 ? 1 : 0]?.code ?? REGULAR], evaluator: { kind: "fixed_amount" as const, amountInput: "amount" } }));
  assert.throws(() => orderDefinitions(cycle), { code: "PAYROLL_ELEMENT_DEPENDENCY_CYCLE" });
});
