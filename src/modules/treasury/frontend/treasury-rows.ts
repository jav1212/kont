import type { TreasuryReadRow } from "@kontave/client-contracts";

/** Narrows the validated Treasury read union to one row kind, keeping the contract as the single source of truth. */
export type TreasuryRow<Kind extends TreasuryReadRow["rowKind"]> = Extract<TreasuryReadRow, { readonly rowKind: Kind }>;

export type TreasuryCashBoxRow = TreasuryRow<"cash_box">;
export type TreasuryBankRow = TreasuryRow<"bank">;
export type TreasuryBankAccountRow = TreasuryRow<"bank_account">;
export type TreasuryBeneficiaryRow = TreasuryRow<"beneficiary">;
export type TreasuryCheckbookRow = TreasuryRow<"checkbook">;
export type TreasuryCheckRow = TreasuryRow<"check">;
export type TreasuryEligibleCollectionRow = TreasuryRow<"eligible_collection">;
export type TreasuryBalanceRow = TreasuryRow<"balance">;
export type TreasuryReportRow = TreasuryRow<"report">;
export type TreasuryPaymentExecutionRow = TreasuryRow<"payment_order_execution">;
export type TreasuryBankDebitTaxPolicyRow = TreasuryRow<"bank_debit_tax_policy">;
export type TreasuryBankDebitTaxAssessmentRow = TreasuryRow<"bank_debit_tax_assessment">;
