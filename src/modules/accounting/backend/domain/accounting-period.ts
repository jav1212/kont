// Domain entity: accounting fiscal period.
// Periods can be open (entries allowed) or closed (immutable).
// Invariant: closed periods cannot receive new posted entries.

export type PeriodStatus = 'open' | 'closed';

export interface AccountingPeriod {
    id:        string;
    companyId: string;
    name:      string;       // e.g. "Enero 2026"
    startDate: string;       // ISO date "YYYY-MM-DD"
    endDate:   string;       // ISO date "YYYY-MM-DD"
    status:    PeriodStatus;
    closedAt:  string | null; // ISO timestamp
    createdAt: string;
    updatedAt: string;
}
