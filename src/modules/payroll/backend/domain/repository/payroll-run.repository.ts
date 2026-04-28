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

export interface IPayrollRunRepository {
    save(input: SavePayrollRunInput): Promise<Result<string>>;
    findByCompany(companyId: string): Promise<Result<PayrollRun[]>>;
    findReceiptsByRun(runId: string): Promise<Result<PayrollReceipt[]>>;
}
