import { Result }         from "@/src/core/domain/result";
import { PayrollRun }     from "../payroll-run";
import { PayrollReceipt } from "../payroll-receipt";

export type PayrollRunStatus = "draft" | "confirmed";

export interface SavePayrollRunInput {
    run: {
        companyId:   string;
        periodStart: string;
        periodEnd:   string;
        exchangeRate: number;
        status?:     PayrollRunStatus;  // defaults to "confirmed" when omitted
    };
    receipts: Omit<PayrollReceipt, "id" | "runId" | "createdAt">[];
}

/** Run identity returned after reverting a confirmed run back to draft. */
export interface UnconfirmedRun {
    id:        string;
    companyId: string;
}

export interface IPayrollRunRepository {
    save(input: SavePayrollRunInput): Promise<Result<string>>;
    findByCompany(companyId: string): Promise<Result<PayrollRun[]>>;
    findReceiptsByRun(runId: string): Promise<Result<PayrollReceipt[]>>;
    /** Reverts a confirmed run to draft so it can be edited and re-confirmed. */
    unconfirm(runId: string): Promise<Result<UnconfirmedRun>>;
}
