import {
  addDecimal, addMoney, exactDecimal, moneyFromMinor, moneyToDecimal, multiplyDecimal, quantizeMoney, sameCurrency,
  type CurrencyDefinition, type ExactDecimal,
} from "@kontave/monetary-domain";
import type { PayrollElementDefinition, PayrollElementEntry, PayrollInputValue, PayrollProcessingPhase } from "./element.js";
import type { PayrollElementCode } from "./identifiers.js";
import { PayrollFailure } from "./payroll-failure.js";
import type { PayrollCalculationMessage, PayrollElementResult, PayrollPolicyReference, PayrollResultBalances, PayrollRunResult } from "./result.js";
import type { PayrollWorkerSnapshot } from "./relationship.js";
import type { PayrollPeriod } from "./period.js";

const PHASE_ORDER: Readonly<Record<PayrollProcessingPhase, number>> = { base_earnings: 10, supplemental_earnings: 20, taxable_bases: 30, employee_deductions: 40, employer_contributions: 50, net_pay: 60, informational: 70 };

export interface CalculatePayrollRelationshipInput {
  readonly worker: PayrollWorkerSnapshot; readonly settlementCurrency: CurrencyDefinition;
  readonly period: PayrollPeriod;
  readonly definitions: readonly PayrollElementDefinition[]; readonly entries: readonly PayrollElementEntry[];
  readonly policyReferences: readonly PayrollPolicyReference[];
}

export function calculatePayrollRelationship(input: CalculatePayrollRelationshipInput): PayrollRunResult {
  const definitions = orderDefinitions(input.definitions.filter((definition) => effectiveInPeriod(definition, input.period)));
  const entriesByCode = new Map<PayrollElementCode, PayrollElementEntry[]>();
  input.entries.filter((entry) => effectiveInPeriod(entry, input.period)).forEach((entry) => {
    if (entry.relationshipId !== input.worker.relationshipId) throw new PayrollFailure("PAYROLL_ELEMENT_ENTRY_INVALID", "Payroll entry belongs to another relationship.");
    entriesByCode.set(entry.elementCode, [...(entriesByCode.get(entry.elementCode) ?? []), entry]);
  });
  const results = new Map<PayrollElementCode, PayrollElementResult>(); const messages: PayrollCalculationMessage[] = [];
  for (const definition of definitions) {
    const entries = entriesByCode.get(definition.code) ?? [];
    if (entries.length === 0 && definition.recurrence === "non_recurring") continue;
    try { results.set(definition.code, evaluate(definition, entries, results, input.settlementCurrency)); }
    catch (cause) {
      messages.push({ severity: "error", code: cause instanceof PayrollFailure ? cause.code : "PAYROLL_CALCULATION_FAILED", relationshipId: input.worker.relationshipId, elementCode: definition.code, message: cause instanceof Error ? cause.message : "Payroll calculation failed." });
    }
  }
  const elements = [...results.values()];
  return { relationshipId: input.worker.relationshipId, worker: input.worker, elements, balances: reconcile(elements, input.settlementCurrency), messages, policyReferences: input.policyReferences };
}

export function orderDefinitions(definitions: readonly PayrollElementDefinition[]): readonly PayrollElementDefinition[] {
  const byCode = new Map(definitions.map((item) => [item.code, item]));
  for (const definition of definitions) for (const dependency of [...definition.dependsOn, ...evaluatorDependencies(definition)]) if (!byCode.has(dependency)) throw new PayrollFailure("PAYROLL_ELEMENT_DEPENDENCY_MISSING", `${definition.code} depends on missing ${dependency}.`);
  const visiting = new Set<PayrollElementCode>(); const visited = new Set<PayrollElementCode>(); const ordered: PayrollElementDefinition[] = [];
  const visit = (definition: PayrollElementDefinition): void => {
    if (visiting.has(definition.code)) throw new PayrollFailure("PAYROLL_ELEMENT_DEPENDENCY_CYCLE", `Dependency cycle at ${definition.code}.`);
    if (visited.has(definition.code)) return; visiting.add(definition.code);
    [...definition.dependsOn, ...evaluatorDependencies(definition)].forEach((code) => visit(requireDefinition(byCode, code)));
    visiting.delete(definition.code); visited.add(definition.code); ordered.push(definition);
  };
  [...definitions].sort((a, b) => PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] || a.priority - b.priority || a.code.localeCompare(b.code)).forEach(visit);
  return ordered;
}

function evaluate(definition: PayrollElementDefinition, entries: readonly PayrollElementEntry[], results: ReadonlyMap<PayrollElementCode, PayrollElementResult>, currency: CurrencyDefinition): PayrollElementResult {
  const values = entries.flatMap((entry) => entry.values); let exact: ExactDecimal; let quantity: ExactDecimal | null = null;
  switch (definition.evaluator.kind) {
    case "fixed_amount": exact = moneyInput(values, definition.evaluator.amountInput, currency); break;
    case "quantity_by_rate": quantity = decimalInputValue(values, definition.evaluator.quantityInput); exact = multiplyDecimal(quantity, moneyInput(values, definition.evaluator.rateInput, currency)); break;
    case "percentage_of_element": exact = multiplyDecimal(resultAmount(results, definition.evaluator.elementCode, currency), divideByHundred(decimalInputValue(values, definition.evaluator.percentageInput))); break;
    case "sum_elements": exact = definition.evaluator.elementCodes.reduce((sum, code) => addDecimal(sum, resultAmount(results, code, currency)), exactDecimal("0")); break;
  }
  return { elementCode: definition.code, classification: definition.classification, phase: definition.phase, sourceEntryIds: entries.map((entry) => entry.id), amount: definition.unit === "money" ? quantizeMoney(exact, currency, "half_up") : null, quantity: definition.unit === "money" ? quantity : exact, trace: { evaluator: definition.evaluator.kind, inputs: values.map(traceInput), dependencies: [...definition.dependsOn, ...evaluatorDependencies(definition)], exactResult: exact, roundingMode: definition.unit === "money" ? "half_up" : "none" } };
}

function reconcile(elements: readonly PayrollElementResult[], currency: CurrencyDefinition): PayrollResultBalances {
  const zero = moneyFromMinor(0n, currency); let gross = zero, deductions = zero, employer = zero;
  for (const element of elements) { if (!element.amount) continue; if (!sameCurrency(element.amount.currency, currency)) throw new PayrollFailure("PAYROLL_CURRENCY_MISMATCH", "Element result uses another currency.");
    if (["regular_earning", "supplemental_earning", "reimbursement"].includes(element.classification)) gross = addMoney(gross, element.amount);
    if (["employee_deduction", "tax"].includes(element.classification)) deductions = addMoney(deductions, element.amount);
    if (element.classification === "employer_contribution") employer = addMoney(employer, element.amount);
  }
  return { grossEarnings: gross, employeeDeductions: deductions, employerContributions: employer, netPay: moneyFromMinor(gross.minorAmount - deductions.minorAmount, currency) };
}

function evaluatorDependencies(definition: PayrollElementDefinition): readonly PayrollElementCode[] { return definition.evaluator.kind === "percentage_of_element" ? [definition.evaluator.elementCode] : definition.evaluator.kind === "sum_elements" ? definition.evaluator.elementCodes : []; }
function requireDefinition(map: ReadonlyMap<PayrollElementCode, PayrollElementDefinition>, code: PayrollElementCode): PayrollElementDefinition { const found = map.get(code); if (!found) throw new PayrollFailure("PAYROLL_ELEMENT_DEPENDENCY_MISSING", `Missing payroll element ${code}.`); return found; }
function moneyInput(values: readonly PayrollInputValue[], name: string, currency: CurrencyDefinition): ExactDecimal { const found = values.find((value): value is Extract<PayrollInputValue, { kind: "money" }> => value.kind === "money" && value.name === name); if (!found || !sameCurrency(found.value.currency, currency)) throw new PayrollFailure("PAYROLL_ELEMENT_ENTRY_INVALID", `Missing or incompatible money input: ${name}`); return moneyToDecimal(found.value); }
function decimalInputValue(values: readonly PayrollInputValue[], name: string): ExactDecimal { const found = values.find((value): value is Extract<PayrollInputValue, { kind: "decimal" }> => value.kind === "decimal" && value.name === name); if (!found) throw new PayrollFailure("PAYROLL_ELEMENT_ENTRY_INVALID", `Missing decimal input: ${name}`); return found.value; }
function resultAmount(results: ReadonlyMap<PayrollElementCode, PayrollElementResult>, code: PayrollElementCode, currency: CurrencyDefinition): ExactDecimal { const amount = results.get(code)?.amount; if (!amount || !sameCurrency(amount.currency, currency)) throw new PayrollFailure("PAYROLL_CALCULATION_FAILED", `Dependency ${code} has no compatible monetary result.`); return moneyToDecimal(amount); }
function divideByHundred(value: ExactDecimal): ExactDecimal { return multiplyDecimal(value, exactDecimal("0.01")); }
function traceInput(value: PayrollInputValue): { name: string; value: string; unit: string } { return value.kind === "money" ? { name: value.name, value: moneyToDecimal(value.value), unit: value.value.currency.code } : { name: value.name, value: value.value, unit: "number" }; }
function effectiveInPeriod(value: { readonly effectiveFrom: string; readonly effectiveUntil: string | null }, period: PayrollPeriod): boolean { return value.effectiveFrom <= period.end && (value.effectiveUntil === null || value.effectiveUntil >= period.start); }
