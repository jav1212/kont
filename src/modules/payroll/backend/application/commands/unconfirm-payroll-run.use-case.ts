// Application layer — reverts a confirmed payroll run back to draft so it can be
// edited and re-confirmed. The accounting integration generated on confirm is
// reversed separately (non-blocking) by the route handler.
import { Result }                                  from "@/src/core/domain/result";
import { IPayrollRunRepository, UnconfirmedRun }   from "../../domain/repository/payroll-run.repository";

export interface UnconfirmPayrollRunInput {
    runId: string;
}

export class UnconfirmPayrollRunUseCase {
    constructor(private readonly repo: IPayrollRunRepository) {}

    async execute(input: UnconfirmPayrollRunInput): Promise<Result<UnconfirmedRun>> {
        if (!input.runId) return Result.fail("runId is required");
        return this.repo.unconfirm(input.runId);
    }
}
