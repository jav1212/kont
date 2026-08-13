import type { CurrencyDefinition, Money } from "@kontave/monetary-domain";
import { addMoney, moneyFromMinor, sameCurrency } from "@kontave/monetary-domain";
import type { PayrollDefinitionId, PayrollRunId } from "./identifiers.js";
import type { PayrollPeriod } from "./period.js";
import { PayrollFailure } from "./payroll-failure.js";
import type { PayrollRunResult } from "./result.js";

export type PayrollRunType = "regular" | "off_cycle" | "final" | "retroactive" | "correction" | "simulation";
export type PayrollRunStatus = "draft" | "calculated" | "calculated_with_warnings" | "approved" | "confirmed" | "reversed";
export interface PayrollRunTotals { readonly grossEarnings: Money; readonly employeeDeductions: Money; readonly employerContributions: Money; readonly netPay: Money; }
export interface PayrollRunState {
  readonly id: PayrollRunId; readonly payrollDefinitionId: PayrollDefinitionId; readonly period: PayrollPeriod; readonly type: PayrollRunType;
  readonly status: PayrollRunStatus; readonly settlementCurrency: CurrencyDefinition; readonly results: readonly PayrollRunResult[];
  readonly totals: PayrollRunTotals; readonly calculatedAt: string | null; readonly approvedAt: string | null; readonly confirmedAt: string | null;
  readonly reversedAt: string | null; readonly reversalReason: string | null;
}

export class PayrollRun {
  private constructor(readonly state: PayrollRunState) {}
  static draft(input: Omit<PayrollRunState, "status" | "results" | "totals" | "calculatedAt" | "approvedAt" | "confirmedAt" | "reversedAt" | "reversalReason">): PayrollRun {
    return new PayrollRun({ ...input, status: "draft", results: [], totals: zeroTotals(input.settlementCurrency), calculatedAt: null, approvedAt: null, confirmedAt: null, reversedAt: null, reversalReason: null });
  }
  calculate(results: readonly PayrollRunResult[], calculatedAt: string): PayrollRun {
    this.requireStatus("draft", "calculated", "calculated_with_warnings");
    if (results.length === 0) throw new PayrollFailure("PAYROLL_CALCULATION_FAILED", "A payroll run requires at least one relationship result.");
    const hasErrors = results.some((result) => result.messages.some((message) => message.severity === "error"));
    const hasWarnings = results.some((result) => result.messages.some((message) => message.severity === "warning"));
    return new PayrollRun({ ...this.state, status: hasErrors || hasWarnings ? "calculated_with_warnings" : "calculated", results: [...results], totals: aggregateResults(results, this.state.settlementCurrency), calculatedAt, approvedAt: null, confirmedAt: null });
  }
  approve(approvedAt: string): PayrollRun {
    this.requireStatus("calculated", "calculated_with_warnings");
    if (this.hasErrors()) throw new PayrollFailure("PAYROLL_RUN_HAS_ERRORS", "A payroll run with calculation errors cannot be approved.");
    return new PayrollRun({ ...this.state, status: "approved", approvedAt });
  }
  confirm(confirmedAt: string, approvalRequired: boolean): PayrollRun {
    if (approvalRequired) this.requireStatus("approved"); else this.requireStatus("calculated", "calculated_with_warnings", "approved");
    if (this.hasErrors()) throw new PayrollFailure("PAYROLL_RUN_HAS_ERRORS", "A payroll run with calculation errors cannot be confirmed.");
    return new PayrollRun({ ...this.state, status: "confirmed", confirmedAt });
  }
  reverse(reversedAt: string, reason: string): PayrollRun {
    this.requireStatus("confirmed"); if (!reason.trim()) throw new PayrollFailure("PAYROLL_RUN_TRANSITION_INVALID", "Payroll reversal requires a reason.");
    return new PayrollRun({ ...this.state, status: "reversed", reversedAt, reversalReason: reason.trim() });
  }
  private hasErrors(): boolean { return this.state.results.some((result) => result.messages.some((message) => message.severity === "error")); }
  private requireStatus(...allowed: readonly PayrollRunStatus[]): void { if (!allowed.includes(this.state.status)) throw new PayrollFailure("PAYROLL_RUN_TRANSITION_INVALID", `Payroll run in ${this.state.status} cannot perform this transition.`); }
}

function zeroTotals(currency: CurrencyDefinition): PayrollRunTotals { const zero = moneyFromMinor(0n, currency); return { grossEarnings: zero, employeeDeductions: zero, employerContributions: zero, netPay: zero }; }
function aggregateResults(results: readonly PayrollRunResult[], currency: CurrencyDefinition): PayrollRunTotals {
  return results.reduce((total, result) => {
    for (const money of Object.values(result.balances)) if (!sameCurrency(money.currency, currency)) throw new PayrollFailure("PAYROLL_RECONCILIATION_FAILED", "Run result currency differs from settlement currency.");
    return { grossEarnings: addMoney(total.grossEarnings, result.balances.grossEarnings), employeeDeductions: addMoney(total.employeeDeductions, result.balances.employeeDeductions), employerContributions: addMoney(total.employerContributions, result.balances.employerContributions), netPay: addMoney(total.netPay, result.balances.netPay) };
  }, zeroTotals(currency));
}
