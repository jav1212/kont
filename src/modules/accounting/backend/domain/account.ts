// Domain entity: chart-of-accounts entry.
// Each account belongs to a company and can be organized in a hierarchy by parentCode.
// Invariant: code must be unique per company; accounts cannot be deleted if linked to posted entries.

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
    id:            string;
    companyId:     string;
    chartId:       string | null; // null = standalone (not part of an imported chart)
    code:          string;        // e.g. "1-01-001"
    name:          string;
    type:          AccountType;
    parentCode:    string | null;
    isActive:      boolean;
    isGroup:       boolean;       // true = summary account (cannot post entries directly)
    saldoInicial:  number;        // opening balance
    createdAt:     string;        // ISO timestamp
    updatedAt:     string;        // ISO timestamp
}
