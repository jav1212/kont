// CestaTicketConfirmedPayload — emitted after a cesta ticket run is successfully confirmed.
export interface CestaTicketConfirmedPayload {
    /** ID of the newly persisted cesta ticket run record. */
    cestaTicketRunId: string;
    companyId:        string;
    periodStart:      string;
    periodEnd:        string;
    /** Number of employee receipts included in this run. */
    employeeCount:    number;
    /** Aggregate amounts (precomputed from receipts at emission time). */
    totalUsd:         number;
    totalVes:         number;
}
