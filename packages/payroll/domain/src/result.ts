import type { ExactDecimal, Money } from "@kontave/monetary-domain";
import type { PayrollElementClassification, PayrollProcessingPhase } from "./element.js";
import type { PayrollElementCode, PayrollElementEntryId, PayrollRelationshipId } from "./identifiers.js";
import type { PayrollWorkerSnapshot } from "./relationship.js";

export interface PayrollPolicyReference { readonly jurisdiction: string; readonly code: string; readonly version: string; readonly effectiveFrom: string; }
export interface PayrollCalculationTrace {
  readonly evaluator: string; readonly inputs: readonly { readonly name: string; readonly value: string; readonly unit: string }[];
  readonly dependencies: readonly PayrollElementCode[]; readonly exactResult: string; readonly roundingMode: string;
}
export interface PayrollElementResult {
  readonly elementCode: PayrollElementCode; readonly classification: PayrollElementClassification; readonly phase: PayrollProcessingPhase;
  readonly sourceEntryIds: readonly PayrollElementEntryId[]; readonly amount: Money | null; readonly quantity: ExactDecimal | null;
  readonly trace: PayrollCalculationTrace;
}
export interface PayrollCalculationMessage { readonly severity: "information" | "warning" | "error"; readonly code: string; readonly relationshipId: PayrollRelationshipId | null; readonly elementCode: PayrollElementCode | null; readonly message: string; }
export interface PayrollResultBalances { readonly grossEarnings: Money; readonly employeeDeductions: Money; readonly employerContributions: Money; readonly netPay: Money; }
export interface PayrollRunResult {
  readonly relationshipId: PayrollRelationshipId; readonly worker: PayrollWorkerSnapshot; readonly elements: readonly PayrollElementResult[];
  readonly balances: PayrollResultBalances; readonly messages: readonly PayrollCalculationMessage[]; readonly policyReferences: readonly PayrollPolicyReference[];
}
