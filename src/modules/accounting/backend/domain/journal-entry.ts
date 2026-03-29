// Domain entity: accounting journal entry (asiento contable).
// Entries start as 'draft' and become immutable once 'posted'.
// Invariant: posted entries must balance (total debits === total credits).
// source tracks whether the entry originated manually or from an integration.

export type EntryStatus = 'draft' | 'posted';
export type EntrySource = 'manual' | 'payroll' | 'inventory';

export interface JournalEntry {
    id:          string;
    companyId:   string;
    periodId:    string;
    entryNumber: number;
    date:        string;            // ISO date "YYYY-MM-DD"
    description: string;
    status:      EntryStatus;
    source:      EntrySource;
    sourceRef:   string | null;     // FK to source record (payroll run id, etc.)
    postedAt:    string | null;     // ISO timestamp
    createdAt:   string;
    updatedAt:   string;
}
