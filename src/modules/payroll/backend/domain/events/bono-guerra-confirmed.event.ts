// BonoGuerraConfirmedPayload — emitted after a bono de guerra run is successfully confirmed.
export interface BonoGuerraConfirmedPayload {
    /** ID of the newly persisted bono de guerra run record. */
    bonoGuerraRunId: string;
    companyId:       string;
    periodStart:     string;
    periodEnd:       string;
    /** Number of employee receipts included in this run. */
    employeeCount:   number;
    /** Aggregate amounts (precomputed from receipts at emission time). */
    totalUsd:        number;
    totalVes:        number;
}
