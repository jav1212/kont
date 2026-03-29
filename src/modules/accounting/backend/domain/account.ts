// Domain entity: chart-of-accounts entry.
// Each account belongs to a company and can be organized in a hierarchy by parentCode.
// Invariant: code must be unique per company; accounts cannot be deleted if linked to posted entries.

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
    id:          string;
    companyId:   string;
    code:        string;       // e.g. "1-01-001"
    name:        string;
    type:        AccountType;
    parentCode:  string | null;
    isActive:    boolean;
    createdAt:   string;       // ISO timestamp
    updatedAt:   string;       // ISO timestamp
}
