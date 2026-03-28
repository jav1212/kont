// EmployeeUpsertedPayload — emitted after a batch upsert of employees succeeds.
export interface EmployeeUpsertedPayload {
    companyId:     string;
    /** Number of employee records that were created or updated. */
    employeeCount: number;
}
