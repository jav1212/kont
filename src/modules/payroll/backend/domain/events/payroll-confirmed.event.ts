// PayrollConfirmedPayload — emitted after a payroll run is successfully persisted.
export interface PayrollConfirmedPayload {
    /** ID of the newly created payroll run record. */
    payrollRunId:  string;
    companyId:     string;
    periodStart:   string;
    periodEnd:     string;
    /** Number of employee receipts included in this run. */
    employeeCount: number;
}
