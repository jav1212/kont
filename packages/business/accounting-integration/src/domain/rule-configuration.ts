import type {
  AccountingIntegrationSource,
  PayrollAccountingAmountField,
  PurchaseAccountingAmountField,
} from "./integration-plan";

/** Amount fields that can be selected by a configuration rule for either supported source. */
export type AccountingIntegrationConfigurationAmountField =
  | PayrollAccountingAmountField
  | PurchaseAccountingAmountField;

/** One editable debit/credit mapping, including its activation state and safe journal description. */
export interface AccountingIntegrationConfigurationRule {
  readonly id: string;
  readonly amountField: AccountingIntegrationConfigurationAmountField;
  readonly debitAccountId: string;
  readonly creditAccountId: string;
  readonly description: string;
  readonly isActive: boolean;
}

/** Versioned editable mappings for one accounting integration source and company scope. */
export interface AccountingIntegrationRuleConfiguration<TSource extends AccountingIntegrationSource = AccountingIntegrationSource> {
  readonly source: TSource;
  readonly version: string;
  readonly rules: readonly AccountingIntegrationConfigurationRule[];
}
