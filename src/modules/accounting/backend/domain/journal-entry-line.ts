// Domain entity: one debit or credit line within a journal entry.
// accountCode and accountName are denormalized for display performance.
// Invariant: amount must be positive; type determines the debit/credit side.

export type LineType = 'debit' | 'credit';

export interface JournalEntryLine {
    id:          string;
    entryId:     string;
    accountId:   string;
    accountCode: string;       // denormalized from accounting_accounts
    accountName: string;       // denormalized from accounting_accounts
    type:        LineType;
    amount:      number;
    description: string | null;
    createdAt:   string;
}
