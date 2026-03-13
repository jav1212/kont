import { Result }               from "@/src/core/domain/result";
import { IPayrollRunRepository } from "../domain/repository/payroll-run.repository";
import { PayrollReceipt }        from "../domain/payroll-receipt";

export class GetPayrollReceiptsUseCase {
    constructor(private readonly repo: IPayrollRunRepository) {}

    async execute(runId: string): Promise<Result<PayrollReceipt[]>> {
        if (!runId) return Result.fail("runId es requerido");
        return this.repo.findReceiptsByRun(runId);
    }
}
