// Application layer — retrieves all payroll runs for a given company.
import { Result }               from "@/src/core/domain/result";
import { IPayrollRunRepository } from "../../domain/repository/payroll-run.repository";
import { PayrollRun }            from "../../domain/payroll-run";

export class GetPayrollRunsUseCase {
    constructor(private readonly repo: IPayrollRunRepository) {}

    async execute(companyId: string): Promise<Result<PayrollRun[]>> {
        if (!companyId) return Result.fail("companyId es requerido");
        return this.repo.findByCompany(companyId);
    }
}
