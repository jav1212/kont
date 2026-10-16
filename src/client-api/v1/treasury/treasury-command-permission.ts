import { PERMISSIONS } from "@kontave/access-control/domain";

/**
 * Resolves the least privileged organization permission for a Treasury write command.
 * @param kind - Untrusted command discriminator received over HTTP.
 * @returns The permission required for the command, or `undefined` when unsupported.
 */
export function treasuryCommandPermission(kind: unknown): typeof PERMISSIONS[keyof typeof PERMISSIONS] | undefined {
  if (typeof kind !== "string") return undefined;
  if (["create_cash_box", "create_bank", "create_bank_account", "create_beneficiary", "create_checkbook"].includes(kind)) return PERMISSIONS.TREASURY_MANAGE;
  if (["issue_check", "record_check_delivery", "record_check_deliveries_batch"].includes(kind)) return PERMISSIONS.TREASURY_CHECKS;
  if (["reverse_ledger_entry", "undo_check_delivery", "undo_reconciliation_match"].includes(kind)) return PERMISSIONS.TREASURY_REVERSE;
  if (["configure_bank_debit_tax_policy", "exclude_bank_debit_tax_operation"].includes(kind)) return PERMISSIONS.TREASURY_TAX_CONFIGURE;
  if (["configure_reconciliation", "activate_reconciliation_rule"].includes(kind)) return PERMISSIONS.TREASURY_MANAGE;
  if (["preview_reconciliation_rule", "run_automatic_reconciliation", "reconcile_manually", "close_reconciliation", "import_bank_statement"].includes(kind)) return PERMISSIONS.TREASURY_RECONCILE;
  if (["create_ledger_draft", "post_ledger_entry", "post_ledger_draft", "create_deposit", "execute_payment_order", "record_foreign_exchange_difference"].includes(kind)) return PERMISSIONS.TREASURY_POST;
  return undefined;
}
