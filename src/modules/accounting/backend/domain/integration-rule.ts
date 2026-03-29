// Domain entity: accounting integration rule.
// Defines which accounts to debit/credit for a given source operation type.
// Each active rule for a company+source produces one journal entry line pair
// when that operation is processed by the integration engine.

export type IntegrationSource = 'payroll' | 'inventory_purchase' | 'inventory_movement';

// Amount fields available per source type:
//   payroll:              total_earnings | total_deductions | net_pay
//   inventory_purchase:  subtotal | vat_amount | total
//   inventory_movement:  total_cost
export type AmountField =
    | 'total_earnings'
    | 'total_deductions'
    | 'net_pay'
    | 'subtotal'
    | 'vat_amount'
    | 'total'
    | 'total_cost';

export interface IntegrationRule {
    id:               string;
    companyId:        string;
    source:           IntegrationSource;
    debitAccountId:   string;
    creditAccountId:  string;
    amountField:      AmountField;
    description:      string;    // entry description (can include {{period}}, {{ref}} tokens)
    isActive:         boolean;
    createdAt:        string;
    updatedAt:        string;
}
