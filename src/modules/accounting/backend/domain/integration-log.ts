// Domain entity: accounting integration log entry.
// Each attempt by the integration engine to create accounting entries
// from an operational source (payroll run, purchase invoice, etc.)
// produces one log row per rule, enabling full traceability.

export type IntegrationStatus = 'success' | 'error' | 'skipped';

export interface IntegrationLogEntry {
    id:           string;
    companyId:    string;
    source:       string;           // 'payroll' | 'inventory_purchase' | ...
    sourceRef:    string;           // ID of the source record
    entryId:      string | null;    // accounting entry created (null if skipped/error)
    status:       IntegrationStatus;
    errorMessage: string | null;
    createdAt:    string;
}
