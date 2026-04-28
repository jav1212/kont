// Application layer — persists a payroll run as a draft.
// Drafts are overwritten in-place when the same period already has a draft.
// If a confirmed run exists for the same period, the draft save is rejected.
import { Result }                              from "@/src/core/domain/result";
import { IPayrollRunRepository, SavePayrollRunInput } from "../../domain/repository/payroll-run.repository";

export class SaveDraftPayrollRunUseCase {
    constructor(private readonly repo: IPayrollRunRepository) {}

    async execute(input: SavePayrollRunInput): Promise<Result<string>> {
        if (!input.run.companyId)        return Result.fail("companyId is required");
        if (!input.run.periodStart)      return Result.fail("periodStart is required");
        if (!input.run.periodEnd)        return Result.fail("periodEnd is required");
        if (input.receipts.length === 0) return Result.fail("No employees to save");

        // Confirmed runs are immutable — never overwrite them with a draft.
        const existing = await this.repo.findByCompany(input.run.companyId);
        if (existing.isSuccess) {
            const confirmed = existing.getValue().find(
                (r) => r.periodStart === input.run.periodStart
                    && r.periodEnd   === input.run.periodEnd
                    && r.status      === "confirmed",
            );
            if (confirmed) {
                return Result.fail("Ya existe una nómina confirmada para este período. No se guardó borrador.");
            }
        }

        return this.repo.save({
            ...input,
            run: { ...input.run, status: "draft" },
        });
    }
}
