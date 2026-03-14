import { Result }                              from "@/src/core/domain/result";
import { IPayrollRunRepository, SavePayrollRunInput } from "../domain/repository/payroll-run.repository";

export class ConfirmPayrollRunUseCase {
    constructor(private readonly repo: IPayrollRunRepository) {}

    async execute(input: SavePayrollRunInput): Promise<Result<string>> {
        if (!input.run.companyId)        return Result.fail("companyId es requerido");
        if (!input.run.periodStart)      return Result.fail("periodStart es requerido");
        if (!input.run.periodEnd)        return Result.fail("periodEnd es requerido");
        if (input.receipts.length === 0) return Result.fail("No hay empleados para confirmar");

        // Prevent duplicate runs for the same period
        const existing = await this.repo.findByCompany(input.run.companyId);
        if (existing.isSuccess) {
            const duplicate = existing.getValue().find(
                (r) => r.periodStart === input.run.periodStart && r.periodEnd === input.run.periodEnd
            );
            if (duplicate) return Result.fail("Ya existe una nómina confirmada para este período.");
        }

        return this.repo.save(input);
    }
}
